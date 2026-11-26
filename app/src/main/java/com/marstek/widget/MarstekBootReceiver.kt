package com.marstek.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-registers the periodic outage monitor job and refreshes widget state
 * after device reboot or app update without requiring the user to open MainActivity.
 */
class MarstekBootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }
        val appContext = context.applicationContext
        val config = MarstekStore.loadConfig(appContext)
        OutageMonitorJobService.syncSchedule(appContext, config.notifyOutages)
        val pendingResult = goAsync()
        MarstekWidgetUpdater.refreshAsync(appContext, pendingResult, isUserInitiated = false)
    }
}
