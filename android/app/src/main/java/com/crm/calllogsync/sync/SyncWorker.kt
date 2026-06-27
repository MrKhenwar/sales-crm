package com.crm.calllogsync.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.crm.calllogsync.data.CallLogReader
import com.crm.calllogsync.data.CrmApi
import com.crm.calllogsync.data.Prefs

class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (!prefs.isConfigured) return Result.success()

        val api = CrmApi(prefs.serverUrl, prefs.token)
        try {
            // Drain the log in batches of 200 to stay under the server's per-request cap.
            var batches = 0
            while (true) {
                val calls = CallLogReader.readSince(
                    applicationContext,
                    prefs.lastSyncedCallId,
                    limit = 200,
                    sinceTimestampMs = prefs.syncSinceMillis,
                )
                if (calls.isEmpty()) return Result.success()
                val result = api.ingest(calls)
                if (result.isFailure) return Result.retry()
                prefs.lastSyncedCallId = calls.maxOf { it.id }
                batches++
                if (calls.size < 200) return Result.success()
                if (batches > 50) return Result.success() // safety brake — 10k calls/run
            }
        } finally {
            api.close()
        }
    }
}
