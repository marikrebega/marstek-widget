package com.marstek.widget

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val executor = Executors.newCachedThreadPool()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            setBackgroundColor(0xFF0B0D10.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false

            addJavascriptInterface(MarstekBridge(), "MarstekNative")

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?
                ): WebResourceResponse? {
                    val uri = request?.url ?: return null
                    if (uri.host != "marstek.local") return null

                    var path = uri.path ?: "/"
                    if (path == "/" || path.isEmpty()) {
                        path = "/index.html"
                    }
                    val assetPath = "web$path"
                    return try {
                        val stream = assets.open(assetPath)
                        val mime = when {
                            assetPath.endsWith(".html") -> "text/html"
                            assetPath.endsWith(".js") || assetPath.endsWith(".mjs") -> "application/javascript"
                            assetPath.endsWith(".css") -> "text/css"
                            assetPath.endsWith(".svg") -> "image/svg+xml"
                            assetPath.endsWith(".png") -> "image/png"
                            assetPath.endsWith(".json") -> "application/json"
                            else -> "application/octet-stream"
                        }
                        WebResourceResponse(mime, "UTF-8", stream)
                    } catch (_: Exception) {
                        WebResourceResponse(
                            "text/plain",
                            "UTF-8",
                            404,
                            "Not Found",
                            emptyMap(),
                            ByteArrayInputStream(ByteArray(0))
                        )
                    }
                }
            }
            loadUrl("https://marstek.local/index.html")
        }
        setContentView(webView)
    }

    override fun onDestroy() {
        super.onDestroy()
        executor.shutdownNow()
    }

    private fun deliverBridgeResult(requestId: String, ok: Boolean, payload: String) {
        val js = "window.__marstekNativeCallback && window.__marstekNativeCallback(${
            JSONObject.quote(requestId)
        }, $ok, ${JSONObject.quote(payload)});"
        runOnUiThread {
            if (!isDestroyed) {
                webView.evaluateJavascript(js, null)
            }
        }
    }

    inner class MarstekBridge {

        @JavascriptInterface
        fun saveConfig(
            ip: String,
            port: Int,
            dischargeLimit: Int,
            chargeLimit: Int,
            providerId: String,
            group: String
        ) {
            MarstekStore.saveConfig(
                context = this@MainActivity,
                ip = ip,
                port = port,
                dischargeLimit = dischargeLimit,
                chargeLimit = chargeLimit,
                providerId = providerId,
                group = group
            )
            MarstekWidgetUpdater.updateAllFromCache(this@MainActivity, isUpdating = false)
        }

        @JavascriptInterface
        fun loadConfig(): String {
            return MarstekStore.configToJson(MarstekStore.loadConfig(this@MainActivity))
        }

        @JavascriptInterface
        fun queryStatusAsync(requestId: String, ip: String, port: Int) {
            executor.execute {
                try {
                    val outcome = MarstekClient.queryMarstekStatus(
                        ip = ip,
                        port = port,
                        includeOptionalDetails = true
                    )
                    if (outcome.status != null) {
                        MarstekStore.saveStatus(this@MainActivity, outcome.status)
                        MarstekWidgetUpdater.updateAllFromCache(this@MainActivity, isUpdating = false)
                    } else {
                        MarstekStore.markStatusError(this@MainActivity)
                    }
                    deliverBridgeResult(requestId, true, outcome.bridgeJson)
                } catch (e: Exception) {
                    val err = JSONObject().apply {
                        put("error", e.message ?: "UDP request failed")
                        put("method", "ES.GetStatus")
                        put("durationMs", 0)
                    }
                    deliverBridgeResult(requestId, true, err.toString())
                }
            }
        }

        @JavascriptInterface
        fun fetchOutagesAsync(
            requestId: String,
            providerId: String,
            group: String,
            @Suppress("UNUSED_PARAMETER") forceRefresh: Boolean
        ) {
            executor.execute {
                try {
                    val outcome = MarstekClient.fetchOutages(providerId, group)
                    MarstekStore.saveOutagesJson(
                        this@MainActivity,
                        outcome.todayJson,
                        outcome.tomorrowJson
                    )
                    MarstekWidgetUpdater.updateAllFromCache(this@MainActivity, isUpdating = false)
                    deliverBridgeResult(requestId, true, outcome.bridgeJson)
                } catch (e: Exception) {
                    val err = JSONObject().apply {
                        put("error", e.message ?: "Failed to load outage schedule")
                    }
                    deliverBridgeResult(requestId, true, err.toString())
                }
            }
        }
    }
}
