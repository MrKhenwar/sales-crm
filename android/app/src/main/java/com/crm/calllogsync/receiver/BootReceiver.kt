package com.crm.calllogsync.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.crm.calllogsync.sync.SyncScheduler

/** Re-arm the periodic worker after a reboot. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            SyncScheduler.schedulePeriodic(context.applicationContext)
        }
    }
}
