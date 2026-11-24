package com.marstek.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent

class MarstekCompactWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val pendingResult = goAsync()
        MarstekWidgetUpdater.refreshAsync(context, pendingResult)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == MarstekWidgetUpdater.ACTION_REFRESH) {
            val pendingResult = goAsync()
            MarstekWidgetUpdater.refreshAsync(context, pendingResult)
        }
    }
}
