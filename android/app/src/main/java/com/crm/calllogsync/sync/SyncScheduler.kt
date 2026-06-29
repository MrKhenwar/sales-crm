package com.crm.calllogsync.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object SyncScheduler {

    private const val PERIODIC = "crm.sync.periodic"
    private const val ONESHOT = "crm.sync.oneshot"

    /** How often the background sync repeats. WorkManager's PeriodicWork floor is
     *  15 min, so we self-reschedule a delayed OneTimeWork chain to hit ~2 min. */
    const val SYNC_INTERVAL_MINUTES = 2L

    /** Start the ~2-min self-rescheduling sync chain (keeps an existing one). */
    fun schedulePeriodic(context: Context) {
        enqueueDelayed(context, ExistingWorkPolicy.KEEP)
    }

    /** Called by SyncWorker at the end of each run to queue the next one. */
    fun scheduleNext(context: Context) {
        enqueueDelayed(context, ExistingWorkPolicy.REPLACE)
    }

    private fun enqueueDelayed(context: Context, policy: ExistingWorkPolicy) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setInitialDelay(SYNC_INTERVAL_MINUTES, TimeUnit.MINUTES)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(PERIODIC, policy, req)
    }

    /** Kick a sync right now (used after permission grant + on call-ended broadcasts). */
    fun runNow(context: Context) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            ONESHOT,
            ExistingWorkPolicy.REPLACE,
            req,
        )
    }

    fun cancelAll(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        WorkManager.getInstance(context).cancelUniqueWork(ONESHOT)
    }
}
