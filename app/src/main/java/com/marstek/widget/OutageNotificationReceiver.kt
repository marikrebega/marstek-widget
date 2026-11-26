package com.marstek.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

class OutageNotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != ACTION_DISABLE_OUTAGE_NOTIFS) return
        val appContext = context.applicationContext
        val cfg = MarstekStore.loadConfig(appContext)
        MarstekStore.saveConfig(
            context = appContext,
            ip = cfg.ip,
            port = cfg.port,
            providerId = cfg.providerId,
            group = cfg.group,
            notifyOutages = false
        )
        OutageMonitorJobService.syncSchedule(appContext, false)
        NotificationManagerCompat.from(appContext).cancelAll()
    }

    companion object {
        const val ACTION_DISABLE_OUTAGE_NOTIFS = "com.marstek.widget.ACTION_DISABLE_OUTAGE_NOTIFS"
    }
}
