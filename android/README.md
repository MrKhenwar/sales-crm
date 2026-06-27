# Sales Call Sync — Android companion app

Reads the phone's call log and pushes every call to/from a CRM lead back to the CRM. Sideloaded via APK (no Play Store).

- Min SDK 26 (Android 8.0)
- Compose UI, Kotlin
- WorkManager for periodic sync (~15 min)
- PhoneStateReceiver for immediate sync on call end
- Encrypted prefs for the API token

## What gets synced

The app reads `CallLog.Calls` (rows added by the system after every incoming/outgoing/missed call), batches new rows since the last successful sync, and POSTs them to the CRM. The CRM matches each row's number to a lead **assigned to the logged-in salesperson** by the last 10 digits — non-matching numbers are quietly skipped.

Each synced row creates / updates a `Call` record in the CRM with: phone, agent (you), timestamp, duration, outcome (CONNECTED / NO_ANSWER from call type + duration), and `provider="android"`.

## Build the APK

You'll need [Android Studio](https://developer.android.com/studio) (Iguana or newer) installed.

```bash
# 1. Open Android Studio → File → Open → select the `android/` folder in this repo.
# 2. Let it download Gradle, AGP, Kotlin (~5 min first time).
# 3. Build → Build Bundle(s) / APK(s) → Build APK(s).
#    The output is at:
#      android/app/build/outputs/apk/debug/app-debug.apk
```

Or from the command line:

```bash
cd android
./gradlew assembleDebug
ls -lh app/build/outputs/apk/debug/app-debug.apk
```

## Send the APK to the salesperson

WhatsApp the file `app-debug.apk` directly. They need to:

1. Open the WhatsApp message → tap the APK → if Android blocks it, tap **Settings** in the dialog → enable **Allow from this source** for WhatsApp → go back and tap install
2. (Alternatively: AirDrop / Drive / email / `adb install app-debug.apk` over USB.)

## First-run setup on the phone

1. Open **Sales Call Sync**
2. In the CRM web app, log in as the salesperson → click your name (top right) → **Profile** → **Generate token**
3. Copy the token AND the **Server URL** shown above it (use your ngrok HTTPS URL if the phone isn't on the same WiFi as the laptop)
4. Paste both into the app → **Save**
5. Tap **Grant permissions** → allow **Call logs** + **Phone**
6. Tap **Test connection** → expect "Connection OK"
7. Tap **Sync now** to backfill historical calls

After that:
- Every time you finish a call, the app syncs ~5 seconds later (PhoneStateReceiver picks up the IDLE state, triggers a one-shot worker)
- WorkManager also does a periodic sweep every ~15 minutes as backup

## Permissions used

| Permission | Why |
|---|---|
| `READ_CALL_LOG` | Read the system call log (the actual call records) |
| `READ_PHONE_STATE` | Detect when a call ends so we can sync immediately |
| `POST_NOTIFICATIONS` | Android 13+ requires this to even show error toasts |
| `RECEIVE_BOOT_COMPLETED` | Re-arm the periodic sync after a phone restart |
| `INTERNET` | Talk to the CRM |
| `ACCESS_NETWORK_STATE` | Skip sync when offline |

## Privacy

- The app only sees calls **to/from numbers that match leads assigned to the logged-in salesperson**. Personal calls to unrelated numbers are filtered out **server-side** — the CRM rejects them with "no_matching_lead." So the CRM still receives the number on every call, but doesn't create a record.
- If full privacy of unrelated calls matters, an Android-side filter can be added (compare against a downloaded list of lead phones before posting). Ask if you want this.
- The token is stored in Android's `EncryptedSharedPreferences` (AES-256). Revoke a token from the CRM Profile page to immediately disconnect the phone.

## Troubleshooting

- **Connection failed: HTTP 401** — token wrong/revoked. Generate a new one in the CRM.
- **No new calls in the log after a call** — Android can take 5-10s to write to CallLog after hang-up. Wait a moment and tap Sync now.
- **Periodic sync isn't running** — manufacturer battery savers (Xiaomi, OnePlus, Samsung) kill background workers aggressively. Disable battery optimization for this app in Settings.
- **`cleartextTraffic` warnings** — the app allows plain HTTP for ngrok dev tunnels. Use HTTPS in production.
