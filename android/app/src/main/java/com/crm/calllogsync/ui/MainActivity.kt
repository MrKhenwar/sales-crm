package com.crm.calllogsync.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.crm.calllogsync.data.Prefs
import com.crm.calllogsync.sync.NotificationPoller
import com.crm.calllogsync.sync.SyncScheduler

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Surface up the URL if launched from a notification tap.
        val openUrl = intent?.getStringExtra("openUrl")
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    AppRoot(initialOpenUrl = openUrl)
                }
            }
        }
        NotificationPoller.ensureChannel(this)
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.getStringExtra("openUrl")?.let { url ->
            webViewHolder.reload(url)
        }
    }
}

@Composable
private fun AppRoot(initialOpenUrl: String?) {
    val context = LocalContext.current
    val prefs = remember { Prefs(context) }
    var selectedTab by remember { mutableIntStateOf(if (prefs.isConfigured) 0 else 1) }
    var serverUrl by remember { mutableStateOf(prefs.serverUrl) }

    LaunchedEffect(Unit) {
        if (prefs.isConfigured) {
            SyncScheduler.schedulePeriodic(context)
            NotificationPoller.schedulePeriodic(context)
        }
    }

    LaunchedEffect(initialOpenUrl) {
        if (initialOpenUrl != null) {
            selectedTab = 0
            webViewHolder.reload(initialOpenUrl)
        }
    }

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f).fillMaxSize()) {
            when (selectedTab) {
                0 -> {
                    if (serverUrl.isBlank()) {
                        EmptyState("Connect first") {
                            Text(
                                "Switch to the Sync tab below, enter your server URL and API token, then come back here.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    } else {
                        CrmWebView(serverUrl = serverUrl, onBackPressed = { /* exit handled by Activity */ })
                    }
                }
                1 -> SyncScreen(prefs = prefs, onSaved = { serverUrl = prefs.serverUrl })
                2 -> InboxStubScreen(prefs)
            }
        }
        BottomNav(
            selected = selectedTab,
            onSelect = { selectedTab = it },
        )
    }
}

@Composable
private fun BottomNav(selected: Int, onSelect: (Int) -> Unit) {
    NavigationBar {
        NavigationBarItem(
            selected = selected == 0,
            onClick = { onSelect(0) },
            icon = { Icon(Icons.Outlined.Phone, contentDescription = "CRM") },
            label = { Text("CRM") },
        )
        NavigationBarItem(
            selected = selected == 1,
            onClick = { onSelect(1) },
            icon = { Icon(Icons.Outlined.Sync, contentDescription = "Sync") },
            label = { Text("Sync") },
        )
        NavigationBarItem(
            selected = selected == 2,
            onClick = { onSelect(2) },
            icon = { Icon(Icons.Outlined.Notifications, contentDescription = "Inbox") },
            label = { Text("Inbox") },
        )
    }
}

@Composable
private fun InboxStubScreen(prefs: Prefs) {
    val context = LocalContext.current
    Column(
        Modifier
            .fillMaxSize()
            .padding(WindowInsets.navigationBars.asPaddingValues())
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Inbox", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        Text(
            "System notifications fire automatically when the server sends them.\n" +
                "Tap any notification to open the matching lead in the CRM tab.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        if (prefs.isConfigured) {
            Text(
                "Polling every ~15 min. To see the full inbox, switch to the CRM tab → tap the bell.",
                style = MaterialTheme.typography.bodySmall,
            )
        } else {
            Text(
                "Connect the app on the Sync tab to start receiving notifications.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun EmptyState(title: String, body: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(WindowInsets.navigationBars.asPaddingValues())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        body()
    }
}
