package com.crm.calllogsync.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.crm.calllogsync.data.CallLogReader
import com.crm.calllogsync.data.CrmApi
import com.crm.calllogsync.data.Prefs
import com.crm.calllogsync.sync.NotificationPoller
import com.crm.calllogsync.sync.SyncScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun SyncScreen(prefs: Prefs, onSaved: () -> Unit) {
    val context = LocalContext.current
    var serverUrl by remember { mutableStateOf(prefs.serverUrl) }
    var token by remember { mutableStateOf(prefs.token) }
    var status by remember { mutableStateOf<String?>(null) }
    var calllogGranted by remember { mutableStateOf(hasPerm(context, Manifest.permission.READ_CALL_LOG)) }
    var phoneStateGranted by remember { mutableStateOf(hasPerm(context, Manifest.permission.READ_PHONE_STATE)) }
    val scope = rememberCoroutineScope()

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        calllogGranted = result[Manifest.permission.READ_CALL_LOG] == true || calllogGranted
        phoneStateGranted = result[Manifest.permission.READ_PHONE_STATE] == true || phoneStateGranted
    }

    LaunchedEffect(Unit) {
        if (prefs.isConfigured && calllogGranted) {
            SyncScheduler.schedulePeriodic(context)
            NotificationPoller.schedulePeriodic(context)
        }
    }

    val safe: PaddingValues = WindowInsets.safeDrawing.asPaddingValues()

    Column(
        Modifier
            .fillMaxSize()
            .padding(safe)
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Connect this device", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(
            "Pair the app with your CRM. Once connected, calls placed/received from your phone " +
                "for any of your assigned leads will sync to the CRM, and you'll get notifications.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        SectionCard("CRM connection") {
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Server URL") },
                placeholder = { Text("http://192.168.1.69:3000 or ngrok URL") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = token,
                onValueChange = { token = it },
                label = { Text("API token") },
                placeholder = { Text("crm_…") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    prefs.serverUrl = serverUrl.trim()
                    prefs.token = token.trim()
                    status = "Saved. CRM tab will open this URL."
                    if (calllogGranted) {
                        SyncScheduler.schedulePeriodic(context)
                        NotificationPoller.schedulePeriodic(context)
                    }
                    onSaved()
                }) { Text("Save") }
                OutlinedButton(onClick = {
                    scope.launch {
                        status = "Testing…"
                        prefs.serverUrl = serverUrl.trim(); prefs.token = token.trim()
                        val api = CrmApi(prefs.serverUrl, prefs.token)
                        val r = withContext(Dispatchers.IO) { api.ingest(emptyList()) }
                        api.close()
                        status = if (r.isSuccess) "Connection OK" else "Failed: ${r.exceptionOrNull()?.message}"
                    }
                }) { Text("Test connection") }
            }
        }

        SectionCard("Permissions") {
            PermRow("Read call log", calllogGranted)
            PermRow("Read phone state", phoneStateGranted)
            Spacer(Modifier.height(8.dp))
            Button(onClick = {
                val perms = mutableListOf(
                    Manifest.permission.READ_CALL_LOG,
                    Manifest.permission.READ_PHONE_STATE,
                )
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    perms += Manifest.permission.POST_NOTIFICATIONS
                }
                launcher.launch(perms.toTypedArray())
            }) { Text(if (calllogGranted && phoneStateGranted) "Re-request" else "Grant permissions") }
        }

        SectionCard("Sync") {
            Text("Auto-syncs every ~15 min and immediately after each call ends.",
                style = MaterialTheme.typography.bodySmall)
            val since = java.text.SimpleDateFormat("d MMM yyyy, HH:mm", java.util.Locale.getDefault())
                .format(java.util.Date(prefs.syncSinceMillis))
            Text("Only calls dated $since onwards will be synced.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    // Always tappable — if something's missing we tell the user exactly
                    // what to fix instead of silently doing nothing.
                    onClick = onClick@{
                        // Re-check the permission live in case it was granted from Settings.
                        val granted = hasPerm(context, Manifest.permission.READ_CALL_LOG)
                        calllogGranted = granted
                        if (prefs.serverUrl.isBlank() || prefs.token.isBlank()) {
                            status = "Enter your Server URL and API token above, then tap Save first."
                            return@onClick
                        }
                        if (!granted) {
                            status = "Call-log permission is needed. Tap “Grant permissions” above and allow it."
                            val perms = mutableListOf(
                                Manifest.permission.READ_CALL_LOG,
                                Manifest.permission.READ_PHONE_STATE,
                            )
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                perms += Manifest.permission.POST_NOTIFICATIONS
                            }
                            launcher.launch(perms.toTypedArray())
                            return@onClick
                        }
                        scope.launch {
                            status = "Syncing…"
                            try {
                                val api = CrmApi(prefs.serverUrl, prefs.token)
                                var totalSent = 0; var created = 0; var updated = 0; var skipped = 0; var batchNum = 0
                                while (true) {
                                    batchNum++
                                    val calls = withContext(Dispatchers.IO) {
                                        CallLogReader.readSince(context, prefs.lastSyncedCallId,
                                            limit = 200, sinceTimestampMs = prefs.syncSinceMillis)
                                    }
                                    if (calls.isEmpty()) break
                                    status = "Syncing batch $batchNum (${calls.size} calls, sent so far: $totalSent)…"
                                    val r = withContext(Dispatchers.IO) { api.ingest(calls) }
                                    if (r.isFailure) {
                                        status = "Sync failed on batch $batchNum: ${r.exceptionOrNull()?.message}"
                                        api.close(); return@launch
                                    }
                                    val res = r.getOrThrow()
                                    created += res.created; updated += res.updated; skipped += res.skipped
                                    totalSent += calls.size
                                    prefs.lastSyncedCallId = calls.maxOf { it.id }
                                    if (calls.size < 200) break
                                }
                                api.close()
                                status = when {
                                    totalSent == 0 -> "No new calls in the log since $since. Use “Reset → today” to re-pull today's calls."
                                    created == 0 && updated == 0 ->
                                        "Read $totalSent call(s), but none matched a lead assigned to you, so nothing was added. " +
                                            "Only calls to/from your assigned leads sync."
                                    else -> "Synced $totalSent call(s): $created added, $updated updated, $skipped skipped (not your leads)."
                                }
                            } catch (t: Throwable) {
                                status = "Crash: ${t.javaClass.simpleName}: ${t.message}"
                            }
                        }
                    }
                ) { Text("Sync now") }
                OutlinedButton(onClick = {
                    prefs.lastSyncedCallId = 0L
                    prefs.syncSinceMillis = Prefs.todayMidnightMillis()
                    status = "Reset. Next sync pulls calls from start of today onwards."
                }) { Text("Reset → today") }
            }
        }

        if (status != null) {
            Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                Text(status!!, modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Card(shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun PermRow(label: String, granted: Boolean) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(
            if (granted) "Granted" else "Missing",
            style = MaterialTheme.typography.labelMedium,
            color = if (granted) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
        )
    }
}

private fun hasPerm(ctx: android.content.Context, p: String): Boolean =
    ContextCompat.checkSelfPermission(ctx, p) == PackageManager.PERMISSION_GRANTED
