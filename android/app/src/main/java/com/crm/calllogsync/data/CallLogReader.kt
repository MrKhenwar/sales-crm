package com.crm.calllogsync.data

import android.content.ContentResolver
import android.content.Context
import android.os.Bundle
import android.provider.CallLog
import kotlinx.datetime.Instant

data class DeviceCall(
    val id: Long,
    val phone: String,
    val startedAt: Instant,
    val durationSec: Int,
    val callType: String, // OUTGOING / MISSED / INCOMING / REJECTED / VOICEMAIL / BLOCKED / ANSWERED_EXTERNALLY
)

object CallLogReader {

    private fun typeName(t: Int): String = when (t) {
        CallLog.Calls.INCOMING_TYPE -> "INCOMING"
        CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
        CallLog.Calls.MISSED_TYPE -> "MISSED"
        CallLog.Calls.VOICEMAIL_TYPE -> "VOICEMAIL"
        CallLog.Calls.REJECTED_TYPE -> "REJECTED"
        CallLog.Calls.BLOCKED_TYPE -> "BLOCKED"
        CallLog.Calls.ANSWERED_EXTERNALLY_TYPE -> "ANSWERED_EXTERNALLY"
        else -> "OUTGOING"
    }

    /**
     * Read call-log rows newer than [sinceCallId]. Uses the Bundle-based query API
     * (API 26+) so the LIMIT and SORT ORDER are honored on all modern Android versions —
     * older versions silently ignore "LIMIT N" in the sortOrder string and some throw.
     */
    fun readSince(
        context: Context,
        sinceCallId: Long,
        limit: Int = 200,
        sinceTimestampMs: Long = 0,
    ): List<DeviceCall> {
        val cols = arrayOf(
            CallLog.Calls._ID,
            CallLog.Calls.NUMBER,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION,
            CallLog.Calls.TYPE,
        )

        val clauses = mutableListOf<String>()
        val args = mutableListOf<String>()
        if (sinceCallId > 0) {
            clauses += "${CallLog.Calls._ID} > ?"
            args += sinceCallId.toString()
        }
        if (sinceTimestampMs > 0) {
            clauses += "${CallLog.Calls.DATE} >= ?"
            args += sinceTimestampMs.toString()
        }

        val queryArgs = Bundle().apply {
            if (clauses.isNotEmpty()) {
                putString(ContentResolver.QUERY_ARG_SQL_SELECTION, clauses.joinToString(" AND "))
                putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args.toTypedArray())
            }
            putStringArray(
                ContentResolver.QUERY_ARG_SORT_COLUMNS,
                arrayOf(CallLog.Calls._ID)
            )
            putInt(
                ContentResolver.QUERY_ARG_SORT_DIRECTION,
                ContentResolver.QUERY_SORT_DIRECTION_ASCENDING
            )
            putInt(ContentResolver.QUERY_ARG_LIMIT, limit)
        }

        val out = ArrayList<DeviceCall>()
        context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            cols,
            queryArgs,
            null
        )?.use { cur ->
            val idxId = cur.getColumnIndexOrThrow(CallLog.Calls._ID)
            val idxNum = cur.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
            val idxDate = cur.getColumnIndexOrThrow(CallLog.Calls.DATE)
            val idxDur = cur.getColumnIndexOrThrow(CallLog.Calls.DURATION)
            val idxType = cur.getColumnIndexOrThrow(CallLog.Calls.TYPE)
            while (cur.moveToNext()) {
                if (out.size >= limit) break // defensive: some providers ignore QUERY_ARG_LIMIT
                val id = cur.getLong(idxId)
                val raw = cur.getString(idxNum) ?: continue
                if (raw.isBlank()) continue
                val dateMs = cur.getLong(idxDate)
                if (sinceTimestampMs > 0 && dateMs < sinceTimestampMs) continue // defensive
                val dur = cur.getInt(idxDur)
                val type = cur.getInt(idxType)
                out.add(
                    DeviceCall(
                        id = id,
                        phone = raw,
                        startedAt = Instant.fromEpochMilliseconds(dateMs),
                        durationSec = dur,
                        callType = typeName(type),
                    )
                )
            }
        }
        return out
    }
}
