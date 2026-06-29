package com.crm.calllogsync.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.crm.calllogsync.BuildConfig

/** Stores server URL + bearer token in an encrypted shared-prefs file. */
class Prefs(context: Context) {
    private val key = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val sp = EncryptedSharedPreferences.create(
        context,
        "crm-prefs",
        key,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    /** Falls back to the build-time default server URL when nothing is saved yet. */
    var serverUrl: String
        get() {
            val saved = sp.getString(KEY_SERVER, "") ?: ""
            return saved.ifBlank { BuildConfig.DEFAULT_SERVER_URL.trimEnd('/') }
        }
        set(v) = sp.edit().putString(KEY_SERVER, v.trimEnd('/')).apply()

    var token: String
        get() = sp.getString(KEY_TOKEN, "") ?: ""
        set(v) = sp.edit().putString(KEY_TOKEN, v.trim()).apply()

    /** Highest CallLog._ID we've already synced — only newer rows get sent next time. */
    var lastSyncedCallId: Long
        get() = sp.getLong(KEY_LAST_ID, 0L)
        set(v) = sp.edit().putLong(KEY_LAST_ID, v).apply()

    /**
     * Only sync calls whose DATE (epoch ms) is >= this. 0 = no filter (all of history).
     * Defaults to today's midnight on first install — sales-team backfill almost never
     * wants pre-today calls, and the device log can hold years of personal calls.
     */
    var syncSinceMillis: Long
        get() {
            val v = sp.getLong(KEY_SINCE_MS, -1L)
            if (v >= 0) return v
            val midnight = todayMidnightMillis()
            sp.edit().putLong(KEY_SINCE_MS, midnight).apply()
            return midnight
        }
        set(v) = sp.edit().putLong(KEY_SINCE_MS, v).apply()

    /** Notification IDs we've already surfaced as a system notification — prevents dupes. */
    val shownNotificationIds: Set<String>
        get() = sp.getStringSet(KEY_SHOWN_IDS, emptySet()) ?: emptySet()

    fun addShownNotificationId(id: String) {
        val cap = 500
        val current = shownNotificationIds.toMutableList()
        if (!current.contains(id)) current += id
        // Keep last `cap` to bound size.
        val trimmed = if (current.size > cap) current.takeLast(cap) else current
        sp.edit().putStringSet(KEY_SHOWN_IDS, trimmed.toSet()).apply()
    }

    val isConfigured: Boolean
        get() = serverUrl.isNotBlank() && token.isNotBlank()

    companion object {
        private const val KEY_SERVER = "serverUrl"
        private const val KEY_TOKEN = "token"
        private const val KEY_LAST_ID = "lastSyncedCallId"
        private const val KEY_SINCE_MS = "syncSinceMillis"
        private const val KEY_SHOWN_IDS = "shownNotificationIds"

        fun todayMidnightMillis(): Long {
            val cal = java.util.Calendar.getInstance()
            cal.set(java.util.Calendar.HOUR_OF_DAY, 0)
            cal.set(java.util.Calendar.MINUTE, 0)
            cal.set(java.util.Calendar.SECOND, 0)
            cal.set(java.util.Calendar.MILLISECOND, 0)
            return cal.timeInMillis
        }
    }
}
