package com.marstek.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle

class MarstekMiniWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val pendingResult = goAsync()
        MarstekWidgetUpdater.refreshAsync(context, pendingResult, isUserInitiated = false)
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle
    ) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        MarstekWidgetUpdater.updateSingleWidgetFromCache(context, MarstekMiniWidgetProvider::class.java, appWidgetId)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        for (id in appWidgetIds) {
            MarstekStore.clearWidgetState(context, id)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val action = intent.action ?: return
        if (action.startsWith("com.marstek.widget.ACTION_")) {
            val pendingResult = goAsync()
            val handled = MarstekWidgetUpdater.handleActionBroadcast(
                context,
                MarstekMiniWidgetProvider::class.java,
                intent,
                pendingResult
            )
            if (!handled) pendingResult.finish()
        }
    }
}
