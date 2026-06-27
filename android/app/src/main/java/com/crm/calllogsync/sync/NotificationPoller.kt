package com.crm.calllogsync.sync

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.crm.calllogsync.data.CrmApi
import com.crm.calllogsync.data.Prefs
import com.crm.calllogsync.ui.MainActivity
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.headers
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.concurrent.TimeUnit

object NotificationPoller {
    private const val UNIQUE_NAME = "crm.notifications.poll"
    const val CHANNEL_ID = "crm-notifications"
    const val CHANNEL_NAME = "CRM events"

    fun schedulePeriodic(context: Context) {
        ensureChannel(context)
        val req = PeriodicWorkRequestBuilder<NotificationPollWorker>(15, TimeUnit.MINUTES)
            .setConstraints(
                Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            )
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            UNIQUE_NAME, ExistingPeriodicWorkPolicy.UPDATE, req,
        )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_NAME)
    }

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(NotificationManager::class.java)
            val ch = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
                description = "New leads, SLA breaches, reassignments"
            }
            nm.createNotificationChannel(ch)
        }
    }
}

@Serializable
private data class NotifLead(val id: String, val name: String, val phone: String)

@Serializable
private data class NotifItem(
    val id: String,
    val type: String,
    val message: String,
    val read: Boolean,
    val createdAt: String,
    val lead: NotifLead? = null,
)

@Serializable
private data class NotifResponse(val unreadCount: Int = 0, val items: List<NotifItem> = emptyList())

class NotificationPollWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (!prefs.isConfigured) return Result.success()

        val client = HttpClient(OkHttp) {
            install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
        }
        try {
            val res = client.get("${prefs.serverUrl}/api/notifications?unread=true&take=20") {
                headers { append(HttpHeaders.Authorization, "Bearer ${prefs.token}") }
            }
            if (res.status.value !in 200..299) return Result.retry()
            val body = res.bodyAsText()
            val parsed = Json { ignoreUnknownKeys = true }.decodeFromString(NotifResponse.serializer(), body)
            for (item in parsed.items) {
                if (prefs.shownNotificationIds.contains(item.id)) continue
                showSystem(applicationContext, item, prefs.serverUrl)
                prefs.addShownNotificationId(item.id)
            }
        } catch (_: Throwable) {
            return Result.retry()
        } finally {
            client.close()
        }
        return Result.success()
    }

    private fun showSystem(context: Context, item: NotifItem, serverUrl: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return
        }
        val title = when (item.type) {
            "NEW_LEAD" -> "New lead"
            "REDIAL_DUE" -> "SLA / redial"
            "LEAD_REASSIGNED" -> "Reassigned"
            else -> "CRM update"
        }
        val openUrl = "$serverUrl/notifications"
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra("openUrl", openUrl)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            context, item.id.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notif = NotificationCompat.Builder(context, NotificationPoller.CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(item.message)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pi)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(item.id.hashCode(), notif)
        } catch (_: SecurityException) { /* permission revoked */ }
    }
}
