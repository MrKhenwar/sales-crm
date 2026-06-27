package com.crm.calllogsync.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import com.crm.calllogsync.sync.SyncScheduler

/**
 * Fires when the phone state changes. We only care about IDLE — that's the moment
 * the system Call Log gets the row for the call that just ended. Kick a one-shot sync.
 */
class PhoneStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
        if (state == TelephonyManager.EXTRA_STATE_IDLE) {
            // small delay would be ideal but BroadcastReceiver should return fast;
            // WorkManager will queue with network constraint
            SyncScheduler.runNow(context.applicationContext)
        }
    }
}
