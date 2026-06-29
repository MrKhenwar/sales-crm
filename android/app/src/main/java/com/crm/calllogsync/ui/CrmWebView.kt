package com.crm.calllogsync.ui

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Hosts the CRM web UI inside the app. Cookies persisted, JS enabled, file uploads
 * for CSV import work, and tel: / wa.me / mailto: links open the native app instead
 * of loading inside the WebView.
 */
@Composable
fun CrmWebView(serverUrl: String, onBackPressed: () -> Unit = {}, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val activity = context as? ComponentActivity

    val fileChooserLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        webViewHolder.fileChooserCallback?.onReceiveValue(uris.toTypedArray())
        webViewHolder.fileChooserCallback = null
    }

    val webView = remember {
        @SuppressLint("SetJavaScriptEnabled")
        WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = true
            settings.allowContentAccess = true
            settings.javaScriptCanOpenWindowsAutomatically = true
            settings.setSupportMultipleWindows(false)
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mediaPlaybackRequiresUserGesture = false

            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    val url = req.url ?: return false
                    val scheme = url.scheme ?: ""
                    return when (scheme) {
                        "tel", "sms", "mailto" -> openExternal(url)
                        "https", "http" -> {
                            val host = url.host ?: ""
                            // WhatsApp links must always open the WhatsApp Business app.
                            if (host == "wa.me" || host.endsWith(".whatsapp.com")) {
                                openWhatsApp(url)
                            } else false
                        }
                        else -> openExternal(url)
                    }
                }

                /** Always prefer WhatsApp Business; fall back to personal WhatsApp, then any handler. */
                private fun openWhatsApp(uri: Uri): Boolean {
                    for (pkg in listOf("com.whatsapp.w4b", "com.whatsapp")) {
                        try {
                            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                                setPackage(pkg)
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                            context.startActivity(intent)
                            return true
                        } catch (_: ActivityNotFoundException) {
                            // package not installed — try the next one
                        }
                    }
                    // Neither WhatsApp app present — let the system decide (browser / chooser).
                    return openExternal(uri)
                }

                private fun openExternal(uri: Uri): Boolean {
                    return try {
                        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        context.startActivity(intent)
                        true
                    } catch (_: ActivityNotFoundException) {
                        false
                    }
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    view: WebView?,
                    filePathCallback: android.webkit.ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    webViewHolder.fileChooserCallback = filePathCallback
                    fileChooserLauncher.launch("*/*")
                    return true
                }
            }
        }
    }

    DisposableEffect(Unit) {
        webViewHolder.view = webView
        onDispose { webViewHolder.view = null }
    }

    LaunchedEffect(serverUrl) {
        if (serverUrl.isNotBlank() && webView.url == null) {
            webView.loadUrl(serverUrl)
        }
    }

    activity?.onBackPressedDispatcher?.let { dispatcher ->
        DisposableEffect(dispatcher) {
            val cb = object : androidx.activity.OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) webView.goBack() else onBackPressed()
                }
            }
            dispatcher.addCallback(cb)
            onDispose { cb.remove() }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        AndroidView(modifier = Modifier.fillMaxSize(), factory = { webView })
    }
}

object webViewHolder {
    var view: WebView? = null
    var fileChooserCallback: android.webkit.ValueCallback<Array<Uri>>? = null
    fun reload(url: String? = null) {
        view?.let {
            if (url != null) it.loadUrl(url) else it.reload()
        }
    }
}
