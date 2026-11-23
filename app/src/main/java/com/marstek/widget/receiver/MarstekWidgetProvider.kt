package com.marstek.widget.receiver

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import com.marstek.widget.R
import com.marstek.widget.data.PreferencesManager
import com.marstek.widget.model.MarstekStatus
import com.marstek.widget.network.MarstekUdpClient
import com.marstek.widget.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MarstekWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val prefs = PreferencesManager(context)
        for (widgetId in appWidgetIds) {
            updateWidgetUI(context, appWidgetManager, widgetId, null, prefs)
        }

        // Trigger immediate background refresh if IP is configured
        if (prefs.deviceIp.isNotBlank()) {
            triggerRefresh(context)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            triggerRefresh(context)
        }
    }

    private fun triggerRefresh(context: Context) {
        val prefs = PreferencesManager(context)
        val ip = prefs.deviceIp
        val port = prefs.devicePort
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val thisWidget = ComponentName(context, MarstekWidgetProvider::class.java)
        val allWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget)

        if (allWidgetIds.isEmpty() || ip.isBlank()) return

        // Set "Updating..." on widgets
        for (widgetId in allWidgetIds) {
            val views = buildRemoteViews(context, widgetId, null, prefs, isUpdating = true)
            appWidgetManager.updateAppWidget(widgetId, views)
        }

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = MarstekUdpClient.getStatus(ip, port)
                val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
                val nowFormatted = timeFormat.format(Date())

                withContext(Dispatchers.Main) {
                    if (result.isSuccess) {
                        val status = result.getOrNull()!!
                        prefs.saveLatestStatus(status, nowFormatted)
                        for (widgetId in allWidgetIds) {
                            val views = buildRemoteViews(context, widgetId, status, prefs, isUpdating = false)
                            appWidgetManager.updateAppWidget(widgetId, views)
                        }
                    } else {
                        for (widgetId in allWidgetIds) {
                            val views = buildRemoteViews(context, widgetId, null, prefs, isUpdating = false, isError = true)
                            appWidgetManager.updateAppWidget(widgetId, views)
                        }
                    }
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_REFRESH = "com.marstek.widget.ACTION_REFRESH"

        fun updateAllWidgets(context: Context) {
            val intent = Intent(context, MarstekWidgetProvider::class.java).apply {
                action = ACTION_REFRESH
            }
            context.sendBroadcast(intent)
        }

        private fun updateWidgetUI(
            context: Context,
            appWidgetManager: AppWidgetManager,
            widgetId: Int,
            status: MarstekStatus?,
            prefs: PreferencesManager
        ) {
            val views = buildRemoteViews(context, widgetId, status, prefs, isUpdating = false)
            appWidgetManager.updateAppWidget(widgetId, views)
        }

        private fun buildRemoteViews(
            context: Context,
            widgetId: Int,
            status: MarstekStatus?,
            prefs: PreferencesManager,
            isUpdating: Boolean = false,
            isError: Boolean = false
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_marstek)

            // Setup click to open MainActivity
            val configIntent = Intent(context, MainActivity::class.java)
            val configPendingIntent = PendingIntent.getActivity(
                context, 0, configIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.tv_title, configPendingIntent)

            // Setup click on refresh button
            val refreshIntent = Intent(context, MarstekWidgetProvider::class.java).apply {
                action = ACTION_REFRESH
            }
            val refreshPendingIntent = PendingIntent.getBroadcast(
                context, widgetId, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_refresh, refreshPendingIntent)

            if (isUpdating) {
                views.setTextViewText(R.id.tv_updated_time, "Updating...")
                return views
            }

            if (isError) {
                views.setTextViewText(R.id.tv_updated_time, "Offline")
                views.setTextColor(R.id.tv_updated_time, Color.parseColor("#EF5350"))
            } else {
                views.setTextViewText(R.id.tv_updated_time, prefs.lastUpdateTime)
                views.setTextColor(R.id.tv_updated_time, Color.parseColor("#80FFFFFF"))
            }

            // Determine SOC to display (live or cached)
            val soc = status?.batSoc ?: prefs.lastCachedSoc
            val pv = status?.pvPower ?: prefs.lastCachedPv
            val grid = status?.onGridPower ?: prefs.lastCachedGrid

            if (soc >= 0) {
                views.setTextViewText(R.id.tv_battery_soc, "$soc %")
                // Colorize battery % according to charge level
                val socColor = when {
                    soc >= 50 -> Color.parseColor("#4CAF50") // Green
                    soc >= 20 -> Color.parseColor("#FF9800") // Orange
                    else -> Color.parseColor("#F44336")      // Red
                }
                views.setTextColor(R.id.tv_battery_soc, socColor)
            } else {
                views.setTextViewText(R.id.tv_battery_soc, "-- %")
                views.setTextColor(R.id.tv_battery_soc, Color.WHITE)
            }

            // Solar PV display
            views.setTextViewText(R.id.tv_pv_power, "${pv} W")

            // Grid power display
            val gridText = if (grid > 0) "+${grid} W" else "${grid} W"
            views.setTextViewText(R.id.tv_grid_power, gridText)
            if (grid < -50) {
                views.setTextViewText(R.id.tv_grid_mode, "Discharging")
                views.setTextColor(R.id.tv_grid_power, Color.parseColor("#00E676"))
            } else if (grid > 50) {
                views.setTextViewText(R.id.tv_grid_mode, "Charging")
                views.setTextColor(R.id.tv_grid_power, Color.parseColor("#29B6F6"))
            } else {
                views.setTextViewText(R.id.tv_grid_mode, "Idle")
                views.setTextColor(R.id.tv_grid_power, Color.parseColor("#B0BEC5"))
            }

            return views
        }
    }
}
