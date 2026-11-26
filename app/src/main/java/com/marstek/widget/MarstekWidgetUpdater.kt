package com.marstek.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

object MarstekWidgetUpdater {

    const val ACTION_REFRESH = "com.marstek.widget.ACTION_REFRESH"
    const val ACTION_WINDOW_PREV = "com.marstek.widget.ACTION_WINDOW_PREV"
    const val ACTION_WINDOW_NEXT = "com.marstek.widget.ACTION_WINDOW_NEXT"
    const val ACTION_WINDOW_CYCLE = "com.marstek.widget.ACTION_WINDOW_CYCLE"
    const val ACTION_DAY_TODAY = "com.marstek.widget.ACTION_DAY_TODAY"
    const val ACTION_DAY_TOMORROW = "com.marstek.widget.ACTION_DAY_TOMORROW"
    const val ACTION_TOGGLE_DAY = "com.marstek.widget.ACTION_TOGGLE_DAY"

    private val executor = Executors.newSingleThreadExecutor()

    private enum class DefaultTier {
        MINI, COMPACT, FULL
    }

    private data class GridSpec(
        val cols: Int,
        val rows: Int
    ) {
        val is1x1: Boolean get() = cols == 1
        val is2x2: Boolean get() = cols == 2 && rows <= 2
        val is2x3: Boolean get() = cols == 2 && rows >= 3
        val isCompactTall: Boolean get() = rows >= 4 && cols == 3
        val isTall: Boolean get() = rows >= 4 && cols >= 4
        val stepHours: Int get() = if (cols >= 4) 1 else 2
    }

    fun updateAllFromCache(context: Context, isUpdating: Boolean = false) {
        val appContext = context.applicationContext
        val manager = AppWidgetManager.getInstance(appContext)

        updateProviderWidgets(appContext, manager, MarstekFullWidgetProvider::class.java, DefaultTier.FULL, isUpdating)
        updateProviderWidgets(appContext, manager, MarstekCompactWidgetProvider::class.java, DefaultTier.COMPACT, isUpdating)
        updateProviderWidgets(appContext, manager, MarstekMiniWidgetProvider::class.java, DefaultTier.MINI, isUpdating)
    }

    fun updateSingleWidgetFromCache(
        context: Context,
        providerClass: Class<*>,
        widgetId: Int
    ) {
        val appContext = context.applicationContext
        val manager = AppWidgetManager.getInstance(appContext)
        val tier = when (providerClass) {
            MarstekFullWidgetProvider::class.java -> DefaultTier.FULL
            MarstekMiniWidgetProvider::class.java -> DefaultTier.MINI
            else -> DefaultTier.COMPACT
        }
        val options = manager.getAppWidgetOptions(widgetId)
        val views = buildAdaptiveRemoteViews(appContext, providerClass, widgetId, options, tier, isUpdating = false)
        manager.updateAppWidget(widgetId, views)
    }

    private fun updateProviderWidgets(
        context: Context,
        manager: AppWidgetManager,
        providerClass: Class<*>,
        defaultTier: DefaultTier,
        isUpdating: Boolean
    ) {
        val ids = manager.getAppWidgetIds(ComponentName(context, providerClass))
        for (id in ids) {
            val options = manager.getAppWidgetOptions(id)
            val views = buildAdaptiveRemoteViews(context, providerClass, id, options, defaultTier, isUpdating)
            manager.updateAppWidget(id, views)
        }
    }

    fun refreshAsync(
        context: Context,
        pendingResult: BroadcastReceiver.PendingResult? = null,
        isUserInitiated: Boolean = false
    ) {
        val appContext = context.applicationContext
        val pm = appContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val isScreenActive = pm?.isInteractive ?: true

        if (isUserInitiated || isScreenActive) {
            try {
                updateAllFromCache(appContext, isUpdating = true)
            } catch (_: Exception) {
            }
        }

        executor.execute {
            try {
                val config = MarstekStore.loadConfig(appContext)

                var udpUpdated = false
                if (isUserInitiated || isScreenActive) {
                    val udpOutcome = MarstekClient.queryMarstekStatus(
                        ip = config.ip,
                        port = config.port,
                        includeOptionalDetails = true,
                        context = appContext,
                        quickMode = true
                    )
                    if (udpOutcome.status != null) {
                        MarstekStore.saveStatus(appContext, udpOutcome.status)
                    } else {
                        val errMsg = try {
                            org.json.JSONObject(udpOutcome.bridgeJson).optString("error", "UDP timeout")
                        } catch (_: Exception) {
                            "UDP timeout"
                        }
                        MarstekStore.markStatusError(appContext, errMsg)
                    }
                    udpUpdated = true
                    updateAllFromCache(appContext, isUpdating = false)
                }

                var outagesChanged = false
                if (isUserInitiated || isScreenActive || config.notifyOutages) {
                    try {
                        val outageOutcome = MarstekClient.fetchOutages(config.providerId, config.group)
                        MarstekStore.saveOutagesJson(
                            appContext,
                            outageOutcome.todayJson,
                            outageOutcome.tomorrowJson
                        )
                        outagesChanged = OutageNotifier.processOutageUpdate(appContext, config, outageOutcome)
                    } catch (_: Exception) {
                    }
                }

                if ((!udpUpdated && (isUserInitiated || isScreenActive)) || outagesChanged) {
                    updateAllFromCache(appContext, isUpdating = false)
                }
            } catch (_: Exception) {
            } finally {
                try {
                    pendingResult?.finish()
                } catch (_: Exception) {
                }
            }
        }
    }

    fun handleActionBroadcast(
        context: Context,
        providerClass: Class<*>,
        intent: Intent,
        pendingResult: BroadcastReceiver.PendingResult?
    ): Boolean {
        val action = intent.action ?: return false
        val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)

        when (action) {
            ACTION_REFRESH -> {
                refreshAsync(context, pendingResult, isUserInitiated = true)
                return true
            }
            ACTION_WINDOW_PREV, ACTION_WINDOW_NEXT, ACTION_WINDOW_CYCLE -> {
                if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                    val (_, tomorrowSlots) = MarstekStore.loadCachedOutages(context)
                    val hasTomorrow = tomorrowSlots.isNotEmpty()
                    val nowHour = MarstekStore.getKyivMinutesNow() / 60
                    val maxStart = if (hasTomorrow) 36 else 12
                    val savedStart = MarstekStore.getWidgetWindowStartHour(context, widgetId)
                    val currentStart = if (savedStart >= 0) savedStart.coerceIn(0, maxStart) else (nowHour - 3).coerceIn(0, 12)
                    val nextStart = when (action) {
                        ACTION_WINDOW_PREV -> (currentStart - 6).coerceIn(0, maxStart)
                        ACTION_WINDOW_NEXT -> (currentStart + 6).coerceIn(0, maxStart)
                        else -> if (currentStart >= maxStart) 0 else (currentStart + 6).coerceIn(0, maxStart)
                    }
                    if (nextStart != currentStart || savedStart < 0) {
                        MarstekStore.setWidgetWindowStartHour(context, widgetId, nextStart)
                        if (hasTomorrow) {
                            MarstekStore.setWidgetDay(context, widgetId, if (nextStart >= 24) "tomorrow" else "today")
                        } else {
                            MarstekStore.setWidgetDay(context, widgetId, "today")
                        }
                        updateSingleWidgetFromCache(context, providerClass, widgetId)
                    }
                }
                pendingResult?.finish()
                return true
            }
            ACTION_DAY_TODAY -> {
                if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                    MarstekStore.setWidgetDay(context, widgetId, "today")
                    MarstekStore.setWidgetWindowStartHour(context, widgetId, -1)
                    updateSingleWidgetFromCache(context, providerClass, widgetId)
                }
                pendingResult?.finish()
                return true
            }
            ACTION_DAY_TOMORROW -> {
                if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                    val (_, tomorrowSlots) = MarstekStore.loadCachedOutages(context)
                    if (tomorrowSlots.isNotEmpty()) {
                        MarstekStore.setWidgetDay(context, widgetId, "tomorrow")
                        MarstekStore.setWidgetWindowStartHour(context, widgetId, 24)
                        updateSingleWidgetFromCache(context, providerClass, widgetId)
                    }
                }
                pendingResult?.finish()
                return true
            }
            ACTION_TOGGLE_DAY -> {
                if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                    val (_, tomorrowSlots) = MarstekStore.loadCachedOutages(context)
                    if (tomorrowSlots.isNotEmpty()) {
                        val currentDay = MarstekStore.getWidgetDay(context, widgetId)
                        if (currentDay == "tomorrow") {
                            MarstekStore.setWidgetDay(context, widgetId, "today")
                            MarstekStore.setWidgetWindowStartHour(context, widgetId, -1)
                        } else {
                            MarstekStore.setWidgetDay(context, widgetId, "tomorrow")
                            MarstekStore.setWidgetWindowStartHour(context, widgetId, 24)
                        }
                        updateSingleWidgetFromCache(context, providerClass, widgetId)
                    }
                }
                pendingResult?.finish()
                return true
            }
            else -> return false
        }
    }

    private fun resolveGridSpec(options: Bundle?, defaultTier: DefaultTier): GridSpec {
        val minW = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) ?: 0
        val minH = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0

        if (minW <= 0 || minH <= 0) {
            return when (defaultTier) {
                DefaultTier.MINI -> GridSpec(2, 2)
                DefaultTier.COMPACT -> GridSpec(4, 2)
                DefaultTier.FULL -> GridSpec(4, 3)
            }
        }

        val cols = when {
            minW < 105 -> 1
            minW < 170 -> 2
            minW < 235 -> 3
            minW < 295 -> 4
            else -> 5
        }
        val rows = when {
            minH < 95 -> 1
            minH < 175 -> 2
            minH < 235 -> 3
            else -> 4
        }

        return when {
            cols == 1 -> GridSpec(1, 1)
            cols == 2 && rows == 1 -> GridSpec(1, 1)
            cols == 2 -> GridSpec(2, rows)
            else -> GridSpec(cols, rows)
        }
    }

    private fun buildAdaptiveRemoteViews(
        context: Context,
        providerClass: Class<*>,
        widgetId: Int,
        options: Bundle?,
        defaultTier: DefaultTier,
        isUpdating: Boolean
    ): RemoteViews {
        val spec = resolveGridSpec(options, defaultTier)
        val config = MarstekStore.loadConfig(context)
        val cached = MarstekStore.loadCachedStatus(context)
        val (todaySlots, tomorrowSlots) = MarstekStore.loadCachedOutages(context)

        val textPrimary = ContextCompat.getColor(context, R.color.text_primary)
        val textBody = ContextCompat.getColor(context, R.color.text_body)
        val textSecondary = ContextCompat.getColor(context, R.color.text_secondary)
        val textMuted = ContextCompat.getColor(context, R.color.text_muted)
        val textSeparator = ContextCompat.getColor(context, R.color.text_separator)
        val textOnAccent = ContextCompat.getColor(context, R.color.text_on_accent)

        val hasSoc = cached.soc >= 0
        val clampedSoc = if (hasSoc) cached.soc.coerceIn(0, 100) else 0
        val netPower = MarstekStore.computeNetBatteryPower(cached.pvPower, cached.onGridPower, cached.offGridPower)
        val durations = MarstekStore.computeEnergyDurations(clampedSoc, cached.batCap, netPower)
        val mode = durations.mode
        val modeColor = mode.resolveColor(context)
        val tempVisuals = MarstekStore.getTemperatureVisuals(cached.batTemp)
        val tempColor = tempVisuals.resolveColor(context)
        val nowMinutes = MarstekStore.getKyivMinutesNow()
        val outage = MarstekStore.evaluateOutageSchedule(todaySlots, nowMinutes, tomorrowSlots)
        val outageHeadlineColor = ContextCompat.getColor(
            context,
            if (outage.isHeadlineTomorrow) R.color.accent_discharge else R.color.accent_outage
        )
        val absWattsText = if (hasSoc) MarstekStore.formatAbsPowerUk(netPower) else "-- Вт"

        val hasTomorrow = tomorrowSlots.isNotEmpty()
        val rawDay = MarstekStore.getWidgetDay(context, widgetId)
        val isTomorrowView = hasTomorrow && rawDay == "tomorrow"
        val nowHour = nowMinutes / 60
        val maxStart = if (hasTomorrow) 36 else 12
        val savedStart = MarstekStore.getWidgetWindowStartHour(context, widgetId)
        val windowStartHour = if (savedStart >= 0) {
            savedStart.coerceIn(0, maxStart)
        } else {
            (nowHour - 3).coerceIn(0, 12)
        }

        val modeIconRes = when (mode) {
            BatteryMode.CHARGING -> R.drawable.ic_mode_charging
            BatteryMode.DISCHARGING -> R.drawable.ic_mode_discharging
            BatteryMode.IDLE -> R.drawable.ic_mode_idle
        }

        val openPi = openAppPendingIntent(context, widgetId)
        val refreshPi = actionPendingIntent(context, providerClass, ACTION_REFRESH, widgetId)

        // 1x1 Micro Square
        if (spec.is1x1) {
            val views = RemoteViews(context.packageName, R.layout.widget_marstek_1x1)
            val gauge = WidgetGraphics.renderGaugeBitmap(context, clampedSoc, hasSoc, mode, 160, 0.11f)
            views.setImageViewBitmap(R.id.miniGaugeImage, gauge)
            views.setTextViewText(R.id.miniSocText, if (hasSoc) "$clampedSoc" else "--")
            views.setImageViewResource(
                R.id.miniStatusDot,
                if (outage.isActiveNow) R.drawable.dot_amber else R.drawable.dot_green
            )
            views.setTextViewText(R.id.miniTimeText, outage.microTimeText)
            views.setOnClickPendingIntent(R.id.widgetRoot, refreshPi)
            return views
        }

        // 2x2 Mini Modular Tiles
        if (spec.is2x2) {
            val views = RemoteViews(context.packageName, R.layout.widget_marstek_2x2)
            views.setImageViewResource(R.id.mini2ModeIcon, modeIconRes)
            views.setTextViewText(R.id.mini2WattsText, absWattsText)
            views.setTextColor(R.id.mini2WattsText, modeColor)

            val gauge = WidgetGraphics.renderGaugeBitmap(context, clampedSoc, hasSoc, mode, 144, 0.11f)
            views.setImageViewBitmap(R.id.mini2GaugeImage, gauge)
            views.setTextViewText(R.id.mini2SocText, if (hasSoc) "$clampedSoc" else "--")
            views.setTextViewText(R.id.mini2DurationText, durations.compactPrimaryValueText)
            views.setTextViewText(R.id.mini2TempText, tempVisuals.label)
            views.setTextColor(R.id.mini2TempText, tempColor)

            views.setTextViewText(R.id.mini2OutageRange, outage.rangeText)
            views.setTextColor(R.id.mini2OutageRange, outageHeadlineColor)
            views.setTextViewText(R.id.mini2OutageCountdown, outage.compactCountdownText)

            views.setOnClickPendingIntent(R.id.mini2RefreshBtn, refreshPi)
            views.setOnClickPendingIntent(R.id.mini2BatteryTile, openPi)
            views.setOnClickPendingIntent(R.id.mini2OutageTile, openPi)
            return views
        }

        // 2x3 Vertical Modular Tiles (2h step timeline)
        if (spec.is2x3) {
            val views = RemoteViews(context.packageName, R.layout.widget_marstek_2x3)
            views.setImageViewResource(R.id.mini2ModeIcon, modeIconRes)
            views.setTextViewText(R.id.mini2WattsText, absWattsText)
            views.setTextColor(R.id.mini2WattsText, modeColor)

            val gauge = WidgetGraphics.renderGaugeBitmap(context, clampedSoc, hasSoc, mode, 180, 0.10f)
            views.setImageViewBitmap(R.id.mini2GaugeImage, gauge)
            views.setTextViewText(R.id.mini2SocText, if (hasSoc) "$clampedSoc" else "--")
            views.setTextViewText(R.id.mini2DurationText, durations.compactPrimaryValueText)
            views.setTextViewText(R.id.mini23SubWhText, durations.secondaryValueText)
            views.setTextViewText(R.id.mini2TempText, tempVisuals.label)
            views.setTextColor(R.id.mini2TempText, tempColor)

            views.setTextViewText(R.id.mini2OutageRange, outage.rangeText)
            views.setTextColor(R.id.mini2OutageRange, outageHeadlineColor)
            views.setTextViewText(R.id.mini2OutageCountdown, outage.compactCountdownText)

            val cyclePi = actionPendingIntent(context, providerClass, ACTION_WINDOW_CYCLE, widgetId)
            val barBitmap = WidgetGraphics.renderScrollableWindowBarBitmap(
                context = context,
                todayBlocks = outage.blocks,
                tomorrowBlocks = MarstekStore.toDayBlocks(tomorrowSlots),
                nowRatio = outage.nowRatio,
                windowStartHour = windowStartHour,
                stepHours = spec.stepHours,
                widthPx = 440,
                heightPx = 76
            )
            views.setImageViewBitmap(R.id.mini23OutageBar, barBitmap)

            views.setOnClickPendingIntent(R.id.mini2RefreshBtn, refreshPi)
            views.setOnClickPendingIntent(R.id.mini2BatteryTile, openPi)
            views.setOnClickPendingIntent(R.id.mini2OutageTile, openPi)
            views.setOnClickPendingIntent(R.id.mini23OutageBar, cyclePi)
            return views
        }

        // 1-Row Horizontal Strips (3x1, 4x1, 5x1)
        if (spec.rows == 1) {
            val views = RemoteViews(context.packageName, R.layout.widget_marstek_strip)
            val gauge = WidgetGraphics.renderGaugeBitmap(context, clampedSoc, hasSoc, mode, 136, 0.11f)
            views.setImageViewBitmap(R.id.stripGaugeImage, gauge)
            views.setTextViewText(R.id.stripSocText, if (hasSoc) "$clampedSoc" else "--")

            views.setImageViewResource(R.id.stripModeIcon, modeIconRes)
            if (spec.cols == 5) {
                views.setTextViewText(R.id.stripTopMetaText, mode.labelUk)
                views.setTextColor(R.id.stripTopMetaText, modeColor)
                views.setTextViewText(R.id.stripWattsTempText, "· $absWattsText · ${tempVisuals.label}")
                views.setTextColor(R.id.stripWattsTempText, textBody)
            } else {
                views.setTextViewText(R.id.stripTopMetaText, absWattsText)
                views.setTextColor(R.id.stripTopMetaText, modeColor)
                views.setTextViewText(R.id.stripWattsTempText, "· ${tempVisuals.label}")
                views.setTextColor(R.id.stripWattsTempText, tempColor)
            }

            val durHeadline = if (spec.cols <= 3) durations.compactPrimaryValueText else durations.primaryValueText
            val durFull = if (spec.cols >= 4) "$durHeadline · ${durations.secondaryValueText}" else durHeadline
            views.setTextViewText(R.id.stripDurationText, durFull)

            views.setTextViewText(
                R.id.stripOutageRange,
                if (spec.cols == 3) outage.microTimeText else outage.rangeText
            )
            views.setTextColor(R.id.stripOutageRange, outageHeadlineColor)
            if (spec.cols >= 4) {
                views.setViewVisibility(R.id.stripOutageAction, View.VISIBLE)
                views.setTextViewText(R.id.stripOutageAction, outage.shortActionText)
            } else {
                views.setViewVisibility(R.id.stripOutageAction, View.GONE)
            }

            views.setOnClickPendingIntent(R.id.stripGaugeContainer, openPi)
            views.setOnClickPendingIntent(R.id.stripInfoContainer, openPi)
            views.setOnClickPendingIntent(R.id.stripOutagePill, openPi)
            views.setOnClickPendingIntent(R.id.stripRefreshBtn, refreshPi)
            return views
        }

        val todayBlocks = outage.blocks
        val tomorrowBlocks = MarstekStore.toDayBlocks(tomorrowSlots)
        val activeHeadline = if (spec.cols <= 4) {
            outage.compactCountdownText
        } else {
            outage.countdownText
        }

        val canPrev = windowStartHour > 0
        val canNext = windowStartHour < maxStart
        val prevPi = actionPendingIntent(context, providerClass, ACTION_WINDOW_PREV, widgetId)
        val nextPi = actionPendingIntent(context, providerClass, ACTION_WINDOW_NEXT, widgetId)
        val cyclePi = actionPendingIntent(context, providerClass, ACTION_WINDOW_CYCLE, widgetId)

        // 2-Row Medium Modular Tiles (3x2, 4x2, 5x2)
        if (spec.rows == 2) {
            val views = RemoteViews(context.packageName, R.layout.widget_marstek_medium)
            views.setImageViewResource(R.id.medModeIcon, modeIconRes)
            val leftHeader = if (spec.cols >= 4) "${mode.labelUk} · $absWattsText" else absWattsText
            views.setTextViewText(R.id.medHeaderLeftText, leftHeader)
            views.setTextColor(R.id.medHeaderLeftText, modeColor)
            views.setTextViewText(R.id.medTempText, tempVisuals.label)
            views.setTextColor(R.id.medTempText, tempColor)

            val showPct = spec.cols >= 5
            val gauge = WidgetGraphics.renderGaugeBitmap(context, clampedSoc, hasSoc, mode, 176, 0.095f)
            views.setImageViewBitmap(R.id.medGaugeImage, gauge)
            views.setTextViewText(
                R.id.medSocText,
                if (hasSoc) (if (showPct) "$clampedSoc%" else "$clampedSoc") else (if (showPct) "--%" else "--")
            )

            val durHeadline = if (spec.cols <= 3) durations.compactPrimaryValueText else durations.primaryValueText
            views.setTextViewText(R.id.medPrimaryDuration, durHeadline)
            views.setTextViewText(R.id.medSecondaryMeta, "${durations.leftLabel} · ${durations.secondaryValueText}")

            views.setTextViewText(R.id.medOutageHeadline, activeHeadline)
            views.setTextColor(R.id.medOutageHeadline, outageHeadlineColor)
            if (hasTomorrow) {
                views.setViewVisibility(R.id.medDayToggleBtn, View.VISIBLE)
                views.setViewVisibility(R.id.medOutageRangeText, View.GONE)
                views.setTextViewText(R.id.medDayToggleBtn, if (isTomorrowView) "Сьогодні ◂" else "Завтра ▸")
                views.setInt(
                    R.id.medDayToggleBtn,
                    "setBackgroundResource",
                    if (isTomorrowView) R.drawable.pill_day_tomorrow_active else R.drawable.pill_day_inactive
                )
                views.setTextColor(
                    R.id.medDayToggleBtn,
                    if (isTomorrowView) textOnAccent else textSecondary
                )
                val togglePi = actionPendingIntent(context, providerClass, ACTION_TOGGLE_DAY, widgetId)
                views.setOnClickPendingIntent(R.id.medDayToggleBtn, togglePi)
            } else {
                views.setViewVisibility(R.id.medDayToggleBtn, View.GONE)
                if (spec.cols >= 5) {
                    views.setViewVisibility(R.id.medOutageRangeText, View.VISIBLE)
                    views.setTextViewText(R.id.medOutageRangeText, outage.rangeText)
                } else {
                    views.setViewVisibility(R.id.medOutageRangeText, View.GONE)
                }
            }

            val barBitmap = WidgetGraphics.renderScrollableWindowBarBitmap(
                context = context,
                todayBlocks = todayBlocks,
                tomorrowBlocks = tomorrowBlocks,
                nowRatio = outage.nowRatio,
                windowStartHour = windowStartHour,
                stepHours = spec.stepHours,
                widthPx = 680,
                heightPx = 76
            )
            views.setImageViewBitmap(R.id.medOutageBarImage, barBitmap)

            views.setOnClickPendingIntent(R.id.medRefreshBtn, refreshPi)
            views.setOnClickPendingIntent(R.id.medGaugeContainer, openPi)
            views.setOnClickPendingIntent(R.id.medInfoContainer, openPi)
            views.setOnClickPendingIntent(R.id.medOutageBarImage, cyclePi)

            views.setBoolean(R.id.medPrevWindowBtn, "setEnabled", canPrev)
            views.setTextColor(R.id.medPrevWindowBtn, if (canPrev) textPrimary else textSeparator)
            views.setInt(R.id.medPrevWindowBtn, "setBackgroundResource", if (canPrev) R.drawable.pill_day_inactive else 0)
            if (canPrev) {
                views.setOnClickPendingIntent(R.id.medPrevWindowBtn, prevPi)
            }

            views.setBoolean(R.id.medNextWindowBtn, "setEnabled", canNext)
            views.setTextColor(R.id.medNextWindowBtn, if (canNext) textPrimary else textSeparator)
            views.setInt(R.id.medNextWindowBtn, "setBackgroundResource", if (canNext) R.drawable.pill_day_inactive else 0)
            if (canNext) {
                views.setOnClickPendingIntent(R.id.medNextWindowBtn, nextPi)
            }
            return views
        }

        // 3-Row Full Dashboard (full), 3x4+ Compact-Tall Stacked (3x4), or 4-Row+ Wide Tall (tall)
        val layoutRes = when {
            spec.isTall -> R.layout.widget_marstek_tall
            spec.isCompactTall -> R.layout.widget_marstek_3x4
            else -> R.layout.widget_marstek_full
        }
        val views = RemoteViews(context.packageName, layoutRes)

        if (spec.cols == 3) {
            views.setViewVisibility(R.id.fullLeftModeIcon, View.VISIBLE)
            views.setImageViewResource(R.id.fullLeftModeIcon, modeIconRes)
            views.setTextViewText(R.id.fullHeaderTitle, absWattsText)
            views.setTextColor(R.id.fullHeaderTitle, modeColor)
            views.setViewVisibility(R.id.fullRightDot, View.GONE)
            views.setViewVisibility(R.id.fullModeIcon, View.GONE)
            views.setViewVisibility(R.id.fullRightWattsText, View.GONE)
        } else {
            views.setViewVisibility(R.id.fullLeftModeIcon, View.GONE)
            val wifiConnected = MarstekClient.isWifiConnected(context)
            val statusHeader = when {
                isUpdating -> "Marstek · Оновлення..."
                cached.isError && !wifiConnected ->
                    if (cached.lastUpdateTime != "--:--") "Без Wi-Fi · ${cached.lastUpdateTime}" else "Без Wi-Fi"
                cached.isError ->
                    if (cached.lastUpdateTime != "--:--") "Кеш · ${cached.lastUpdateTime}" else "Офлайн"
                else -> "Marstek · ${cached.lastUpdateTime}"
            }
            views.setTextViewText(R.id.fullHeaderTitle, statusHeader)
            views.setTextColor(R.id.fullHeaderTitle, textSecondary)
            views.setViewVisibility(R.id.fullRightDot, View.VISIBLE)
            views.setViewVisibility(R.id.fullModeIcon, View.VISIBLE)
            views.setViewVisibility(R.id.fullRightWattsText, View.VISIBLE)
            views.setImageViewResource(R.id.fullModeIcon, modeIconRes)
            views.setTextViewText(R.id.fullRightWattsText, absWattsText)
            views.setTextColor(R.id.fullRightWattsText, modeColor)
        }

        views.setTextViewText(R.id.fullTempText, tempVisuals.label)
        views.setTextColor(R.id.fullTempText, tempColor)

        val showPct = spec.cols >= 4 || spec.isCompactTall
        val gaugePx = if (spec.isTall) 256 else 220
        val gauge = WidgetGraphics.renderGaugeBitmap(context, clampedSoc, hasSoc, mode, gaugePx, 0.085f)
        views.setImageViewBitmap(R.id.fullGaugeImage, gauge)
        views.setTextViewText(
            R.id.fullSocText,
            if (hasSoc) (if (showPct) "$clampedSoc%" else "$clampedSoc") else (if (showPct) "--%" else "--")
        )

        views.setTextViewText(
            R.id.fullCardTitle,
            if (spec.cols == 3 && !spec.isCompactTall) durations.leftLabel else "${durations.cardTitle} (${durations.leftLabel})"
        )
        views.setTextViewText(
            R.id.fullPrimaryValue,
            if (spec.cols <= 3 && !spec.isCompactTall) durations.compactPrimaryValueText else durations.primaryValueText
        )
        views.setTextViewText(
            R.id.fullSecondaryValue,
            if (spec.cols == 3 && !spec.isCompactTall) durations.secondaryValueText else "${durations.rightLabel}: ${durations.secondaryValueText}"
        )

        if (spec.isTall || spec.isCompactTall) {
            val gridAbs = MarstekStore.formatAbsPowerUk(-cached.onGridPower)
            val pvAbs = if (cached.pvPower > 25) "${cached.pvPower} Вт" else "0 Вт"
            views.setTextViewText(R.id.tallPowerBreakdown, "Сонце: $pvAbs · Мережа: $gridAbs")
        }

        val enoughOutage = durations.dischargeMinutesLeft != null &&
            outage.targetOutageMinutes != null &&
            durations.dischargeMinutesLeft >= outage.targetOutageMinutes
        views.setViewVisibility(R.id.fullEnoughOutage, if (enoughOutage) View.VISIBLE else View.GONE)

        views.setTextViewText(R.id.fullOutageHeadline, activeHeadline)
        views.setTextColor(R.id.fullOutageHeadline, outageHeadlineColor)
        views.setTextViewText(
            R.id.fullOutageGroup,
            if (spec.cols == 3) config.group else "Черга ${config.group}"
        )

        if (hasTomorrow) {
            views.setViewVisibility(R.id.fullDayToggleGroup, View.VISIBLE)
            views.setInt(
                R.id.fullBtnToday,
                "setBackgroundResource",
                if (!isTomorrowView) R.drawable.pill_day_active else 0
            )
            views.setTextColor(
                R.id.fullBtnToday,
                if (!isTomorrowView) textOnAccent else textMuted
            )
            views.setInt(
                R.id.fullBtnTomorrow,
                "setBackgroundResource",
                if (isTomorrowView) R.drawable.pill_day_tomorrow_active else 0
            )
            views.setTextColor(
                R.id.fullBtnTomorrow,
                if (isTomorrowView) textOnAccent else textMuted
            )
            views.setOnClickPendingIntent(
                R.id.fullBtnToday,
                actionPendingIntent(context, providerClass, ACTION_DAY_TODAY, widgetId)
            )
            views.setOnClickPendingIntent(
                R.id.fullBtnTomorrow,
                actionPendingIntent(context, providerClass, ACTION_DAY_TOMORROW, widgetId)
            )
        } else {
            views.setViewVisibility(R.id.fullDayToggleGroup, View.GONE)
        }

        val barWidthPx = if (spec.cols <= 3) 480 else 720
        val barHeightPx = 76
        val barBitmap = WidgetGraphics.renderScrollableWindowBarBitmap(
            context = context,
            todayBlocks = todayBlocks,
            tomorrowBlocks = tomorrowBlocks,
            nowRatio = outage.nowRatio,
            windowStartHour = windowStartHour,
            stepHours = spec.stepHours,
            widthPx = barWidthPx,
            heightPx = barHeightPx
        )
        views.setImageViewBitmap(R.id.fullOutageBarImage, barBitmap)

        val chipsToRender: List<OutageChipUi> = if (isTomorrowView) {
            tomorrowSlots.mapIndexed { idx, slot ->
                OutageChipUi("${slot.start}–${slot.end}", idx == 0)
            }
        } else {
            outage.todaySlotChips
        }

        if (spec.isTall) {
            val maxChips = min(8, chipsToRender.size)
            val allChipIds = intArrayOf(
                R.id.fullChip0, R.id.fullChip1, R.id.fullChip2, R.id.fullChip3,
                R.id.fullChip4, R.id.fullChip5, R.id.fullChip6, R.id.fullChip7
            )
            views.setViewVisibility(R.id.fullChipsRow, if (maxChips > 0) View.VISIBLE else View.GONE)
            views.setViewVisibility(R.id.tallChipsRow2, if (maxChips > 4) View.VISIBLE else View.GONE)
            for (i in allChipIds.indices) {
                if (i < maxChips) {
                    val chip = chipsToRender[i]
                    views.setViewVisibility(allChipIds[i], View.VISIBLE)
                    views.setTextViewText(allChipIds[i], chip.label)
                    views.setInt(
                        allChipIds[i],
                        "setBackgroundResource",
                        if (chip.isHighlight) R.drawable.pill_day_active else R.drawable.pill_day_inactive
                    )
                    views.setTextColor(
                        allChipIds[i],
                        if (chip.isHighlight) textOnAccent else textBody
                    )
                } else {
                    views.setViewVisibility(allChipIds[i], View.GONE)
                }
            }
        } else {
            val maxChips = min(if (spec.cols == 3) 3 else 4, chipsToRender.size)
            val chipIds = intArrayOf(R.id.fullChip0, R.id.fullChip1, R.id.fullChip2, R.id.fullChip3)
            if (spec.isCompactTall) {
                views.setViewVisibility(R.id.tallChipsRow2, View.GONE)
            }
            if (maxChips == 0) {
                views.setViewVisibility(R.id.fullChipsRow, View.GONE)
            } else {
                views.setViewVisibility(R.id.fullChipsRow, View.VISIBLE)
                for (i in chipIds.indices) {
                    if (i < maxChips) {
                        val chip = chipsToRender[i]
                        views.setViewVisibility(chipIds[i], View.VISIBLE)
                        views.setTextViewText(chipIds[i], chip.label)
                        views.setInt(
                            chipIds[i],
                            "setBackgroundResource",
                            if (chip.isHighlight) R.drawable.pill_day_active else R.drawable.pill_day_inactive
                        )
                        views.setTextColor(
                            chipIds[i],
                            if (chip.isHighlight) textOnAccent else textBody
                        )
                    } else {
                        views.setViewVisibility(chipIds[i], View.GONE)
                    }
                }
            }
        }

        views.setOnClickPendingIntent(R.id.fullRefreshBtn, refreshPi)
        views.setOnClickPendingIntent(R.id.fullHeaderTitle, openPi)
        views.setOnClickPendingIntent(R.id.fullGaugeContainer, openPi)
        views.setOnClickPendingIntent(R.id.fullInfoContainer, openPi)
        views.setOnClickPendingIntent(R.id.fullOutageBarImage, cyclePi)

        views.setBoolean(R.id.fullPrevWindowBtn, "setEnabled", canPrev)
        views.setTextColor(R.id.fullPrevWindowBtn, if (canPrev) textPrimary else textSeparator)
        views.setInt(R.id.fullPrevWindowBtn, "setBackgroundResource", if (canPrev) R.drawable.pill_day_inactive else 0)
        if (canPrev) {
            views.setOnClickPendingIntent(R.id.fullPrevWindowBtn, prevPi)
        }

        views.setBoolean(R.id.fullNextWindowBtn, "setEnabled", canNext)
        views.setTextColor(R.id.fullNextWindowBtn, if (canNext) textPrimary else textSeparator)
        views.setInt(R.id.fullNextWindowBtn, "setBackgroundResource", if (canNext) R.drawable.pill_day_inactive else 0)
        if (canNext) {
            views.setOnClickPendingIntent(R.id.fullNextWindowBtn, nextPi)
        }

        return views
    }

    private fun openAppPendingIntent(context: Context, widgetId: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data = Uri.parse("marstek://open/$widgetId")
        }
        return PendingIntent.getActivity(
            context,
            max(1, widgetId) * 100 + 1,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun actionPendingIntent(
        context: Context,
        providerClass: Class<*>,
        action: String,
        widgetId: Int
    ): PendingIntent {
        val codeOffset = when (action) {
            ACTION_REFRESH -> 2
            ACTION_WINDOW_PREV -> 3
            ACTION_WINDOW_NEXT -> 4
            ACTION_WINDOW_CYCLE -> 8
            ACTION_DAY_TODAY -> 5
            ACTION_DAY_TOMORROW -> 6
            ACTION_TOGGLE_DAY -> 7
            else -> 9
        }
        val intent = Intent(context, providerClass).apply {
            this.action = action
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            data = Uri.parse("marstek://widget/$widgetId/$action")
        }
        return PendingIntent.getBroadcast(
            context,
            max(1, widgetId) * 100 + codeOffset,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
