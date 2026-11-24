package com.marstek.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import java.util.concurrent.Executors

object MarstekWidgetUpdater {

    const val ACTION_REFRESH = "com.marstek.widget.ACTION_REFRESH"
    private val executor = Executors.newSingleThreadExecutor()

    fun updateAllFromCache(context: Context, isUpdating: Boolean = false) {
        val appContext = context.applicationContext
        val manager = AppWidgetManager.getInstance(appContext)

        val fullIds = manager.getAppWidgetIds(
            ComponentName(appContext, MarstekFullWidgetProvider::class.java)
        )
        if (fullIds.isNotEmpty()) {
            val fullViews = buildFullRemoteViews(appContext, isUpdating)
            manager.updateAppWidget(fullIds, fullViews)
        }

        val compactIds = manager.getAppWidgetIds(
            ComponentName(appContext, MarstekCompactWidgetProvider::class.java)
        )
        if (compactIds.isNotEmpty()) {
            val compactViews = buildCompactRemoteViews(appContext)
            manager.updateAppWidget(compactIds, compactViews)
        }
    }

    fun refreshAsync(context: Context, pendingResult: BroadcastReceiver.PendingResult? = null) {
        val appContext = context.applicationContext
        updateAllFromCache(appContext, isUpdating = true)

        executor.execute {
            try {
                val config = MarstekStore.loadConfig(appContext)

                val udpOutcome = MarstekClient.queryMarstekStatus(
                    ip = config.ip,
                    port = config.port,
                    includeOptionalDetails = false
                )
                if (udpOutcome.status != null) {
                    MarstekStore.saveStatus(appContext, udpOutcome.status)
                } else {
                    MarstekStore.markStatusError(appContext)
                }

                try {
                    val outageOutcome = MarstekClient.fetchOutages(config.providerId, config.group)
                    MarstekStore.saveOutagesJson(
                        appContext,
                        outageOutcome.todayJson,
                        outageOutcome.tomorrowJson
                    )
                } catch (_: Exception) {
                    // Keep previously cached outages if temporarily offline
                }

                updateAllFromCache(appContext, isUpdating = false)
            } finally {
                try {
                    pendingResult?.finish()
                } catch (_: Exception) {
                }
            }
        }
    }

    private fun openAppPendingIntent(context: Context, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun refreshPendingIntent(
        context: Context,
        providerClass: Class<*>,
        requestCode: Int
    ): PendingIntent {
        val intent = Intent(context, providerClass).apply {
            action = ACTION_REFRESH
        }
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun buildFullRemoteViews(context: Context, isUpdating: Boolean): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_marstek_full)
        val config = MarstekStore.loadConfig(context)
        val cached = MarstekStore.loadCachedStatus(context)
        val (todaySlots, tomorrowSlots) = MarstekStore.loadCachedOutages(context)

        val hasSoc = cached.soc >= 0
        val clampedSoc = if (hasSoc) cached.soc.coerceIn(0, 100) else 0
        val netPower = MarstekStore.computeNetBatteryPower(
            cached.pvPower,
            cached.onGridPower,
            cached.offGridPower
        )
        val durations = MarstekStore.computeEnergyDurations(
            soc = clampedSoc,
            batCapWh = cached.batCap,
            netBatteryPower = netPower
        )
        val mode = durations.mode
        val outage = MarstekStore.evaluateOutageSchedule(
            todaySlots = todaySlots,
            nowMinutes = MarstekStore.getKyivMinutesNow(),
            tomorrowSlots = tomorrowSlots
        )

        val headerTitle = when {
            isUpdating -> "Marstek · Оновлення..."
            cached.isError -> "Marstek · Офлайн"
            else -> "Marstek"
        }
        views.setTextViewText(R.id.fullHeaderTitle, headerTitle)

        val (badgeBg, badgeIcon) = when (mode) {
            BatteryMode.CHARGING -> R.drawable.badge_charging to R.drawable.ic_mode_charging
            BatteryMode.DISCHARGING -> R.drawable.badge_discharging to R.drawable.ic_mode_discharging
            BatteryMode.IDLE -> R.drawable.badge_idle to R.drawable.ic_mode_idle
        }
        views.setInt(R.id.fullModeBadge, "setBackgroundResource", badgeBg)
        views.setImageViewResource(R.id.fullModeIcon, badgeIcon)
        views.setTextViewText(R.id.fullModeLabel, mode.labelUk)
        views.setTextColor(R.id.fullModeLabel, mode.colorInt)

        val gaugeBitmap = WidgetGraphics.renderGaugeBitmap(
            soc = clampedSoc,
            hasSoc = hasSoc,
            mode = mode,
            sizePx = 360,
            strokeWidthRatio = 0.07f
        )
        views.setImageViewBitmap(R.id.fullGaugeImage, gaugeBitmap)
        views.setTextViewText(R.id.fullSocText, if (hasSoc) "$clampedSoc%" else "--%")
        views.setTextViewText(
            R.id.fullPowerText,
            if (hasSoc) MarstekStore.formatPowerUk(netPower) else "-- Вт"
        )

        views.setTextViewText(R.id.fullCardTitle, durations.cardTitle)
        views.setTextViewText(R.id.fullLeftLabel, durations.leftLabel)
        views.setTextViewText(R.id.fullPrimaryValue, durations.primaryValueText)
        views.setTextViewText(R.id.fullRightLabel, durations.rightLabel)
        views.setTextViewText(R.id.fullSecondaryValue, durations.secondaryValueText)

        views.setTextViewText(R.id.fullOutageGroup, "Черга ${config.group} · Сьогодні")
        views.setTextViewText(R.id.fullOutageRange, outage.rangeText)
        views.setTextViewText(R.id.fullOutageCountdown, outage.countdownText)

        val barBitmap = WidgetGraphics.renderOutageBarBitmap(
            blocks = outage.blocks,
            nowRatio = outage.nowRatio
        )
        views.setImageViewBitmap(R.id.fullOutageBarImage, barBitmap)

        val openPi = openAppPendingIntent(context, 101)
        val refreshPi = refreshPendingIntent(context, MarstekFullWidgetProvider::class.java, 102)
        views.setOnClickPendingIntent(R.id.fullHeaderTitle, openPi)
        views.setOnClickPendingIntent(R.id.fullModeBadge, refreshPi)
        views.setOnClickPendingIntent(R.id.fullGaugeContainer, refreshPi)

        return views
    }

    private fun buildCompactRemoteViews(context: Context): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_marstek_compact)
        val cached = MarstekStore.loadCachedStatus(context)
        val (todaySlots, tomorrowSlots) = MarstekStore.loadCachedOutages(context)

        val hasSoc = cached.soc >= 0
        val clampedSoc = if (hasSoc) cached.soc.coerceIn(0, 100) else 0
        val netPower = MarstekStore.computeNetBatteryPower(
            cached.pvPower,
            cached.onGridPower,
            cached.offGridPower
        )
        val durations = MarstekStore.computeEnergyDurations(
            soc = clampedSoc,
            batCapWh = cached.batCap,
            netBatteryPower = netPower
        )
        val mode = durations.mode
        val outage = MarstekStore.evaluateOutageSchedule(
            todaySlots = todaySlots,
            nowMinutes = MarstekStore.getKyivMinutesNow(),
            tomorrowSlots = tomorrowSlots
        )

        val gaugeBitmap = WidgetGraphics.renderGaugeBitmap(
            soc = clampedSoc,
            hasSoc = hasSoc,
            mode = mode,
            sizePx = 220,
            strokeWidthRatio = 0.09f
        )
        views.setImageViewBitmap(R.id.compactGaugeImage, gaugeBitmap)
        views.setTextViewText(R.id.compactSocText, if (hasSoc) "$clampedSoc%" else "--%")

        val modeIcon = when (mode) {
            BatteryMode.CHARGING -> R.drawable.ic_mode_charging
            BatteryMode.DISCHARGING -> R.drawable.ic_mode_discharging
            BatteryMode.IDLE -> R.drawable.ic_mode_idle
        }
        views.setImageViewResource(R.id.compactModeIcon, modeIcon)
        views.setTextViewText(R.id.compactModeLabel, mode.labelUk)
        views.setTextColor(R.id.compactModeLabel, mode.colorInt)

        views.setTextViewText(R.id.compactPrimaryDuration, durations.primaryValueText)
        views.setTextViewText(R.id.compactSubDuration, durations.compactSubText)
        views.setTextViewText(R.id.compactOutageCountdown, outage.compactCountdownText)
        views.setTextViewText(R.id.compactOutageRange, outage.rangeText)

        val openPi = openAppPendingIntent(context, 201)
        val refreshPi = refreshPendingIntent(context, MarstekCompactWidgetProvider::class.java, 202)
        views.setOnClickPendingIntent(R.id.compactGaugeContainer, openPi)
        views.setOnClickPendingIntent(R.id.compactInfoContainer, refreshPi)

        return views
    }
}
