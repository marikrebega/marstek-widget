package com.marstek.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import androidx.core.content.ContextCompat
import kotlin.math.ceil
import kotlin.math.floor

object WidgetGraphics {

    fun renderGaugeBitmap(
        context: Context,
        soc: Int,
        hasSoc: Boolean,
        mode: BatteryMode,
        sizePx: Int,
        strokeWidthRatio: Float
    ): Bitmap {
        val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val strokeWidth = sizePx * strokeWidthRatio
        val radius = sizePx * 0.39f
        val cx = sizePx / 2f
        val cy = sizePx / 2f
        val arcBounds = RectF(cx - radius, cy - radius, cx + radius, cy + radius)

        val trackColor = ContextCompat.getColor(context, R.color.bg_gauge_track)
        val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            color = trackColor
            this.strokeWidth = strokeWidth
            strokeCap = Paint.Cap.ROUND
        }
        canvas.drawCircle(cx, cy, radius, trackPaint)

        val clampedSoc = if (hasSoc) soc.coerceIn(0, 100) else 0
        if (clampedSoc > 0) {
            val arcPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                color = mode.resolveColor(context)
                this.strokeWidth = strokeWidth
                strokeCap = Paint.Cap.ROUND
            }
            val sweepAngle = (clampedSoc / 100f) * 360f
            canvas.drawArc(arcBounds, -90f, sweepAngle, false, arcPaint)
        }

        return bitmap
    }

    /**
     * Renders a crisp 12-hour viewport window of the 00-24 (+ optional tomorrow 00-24) timeline
     * with hour dividers, amber today slots, blue tomorrow slots, white "now" marker,
     * blue day divider ("ЗВТ"), and adaptive hour tick labels (1h step for >=4 cols, 2h step for <=3 cols).
     */
    fun renderScrollableWindowBarBitmap(
        context: Context,
        todayBlocks: List<OutageBlockRatio>,
        tomorrowBlocks: List<OutageBlockRatio>,
        nowRatio: Float,
        windowStartHour: Int,
        stepHours: Int,
        widthPx: Int = 720,
        heightPx: Int = 76
    ): Bitmap {
        val bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val todayBarBg = ContextCompat.getColor(context, R.color.bg_gauge_track)
        val tomorrowBarBg = ContextCompat.getColor(context, R.color.bg_outage_bar_track)
        val outageTodayColor = ContextCompat.getColor(context, R.color.accent_outage)
        val outageTomorrowColor = ContextCompat.getColor(context, R.color.accent_discharge)
        val dividerLineColor = ContextCompat.getColor(context, R.color.timeline_hour_divider)
        val dayDividerColor = ContextCompat.getColor(context, R.color.timeline_day_divider)
        val nowMarkerColor = ContextCompat.getColor(context, R.color.text_primary)
        val tickTextColor = ContextCompat.getColor(context, R.color.text_muted)

        val barHeight = heightPx * 0.42f
        val barTop = 2f
        val barBottom = barTop + barHeight
        val cornerRadius = barHeight * 0.45f

        val hasTomorrow = tomorrowBlocks.isNotEmpty()
        val windowEndHour = windowStartHour + 12

        val barClip = Path().apply {
            addRoundRect(
                RectF(0f, barTop, widthPx.toFloat(), barBottom),
                cornerRadius,
                cornerRadius,
                Path.Direction.CW
            )
        }

        canvas.save()
        canvas.clipPath(barClip)

        val bgTodayPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = todayBarBg
        }
        val bgTomorrowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = tomorrowBarBg
        }

        if (!hasTomorrow || windowEndHour <= 24) {
            canvas.drawRect(0f, barTop, widthPx.toFloat(), barBottom, bgTodayPaint)
        } else if (windowStartHour >= 24) {
            canvas.drawRect(0f, barTop, widthPx.toFloat(), barBottom, bgTomorrowPaint)
        } else {
            val splitX = ((24 - windowStartHour) / 12f) * widthPx
            canvas.drawRect(0f, barTop, splitX, barBottom, bgTodayPaint)
            canvas.drawRect(splitX, barTop, widthPx.toFloat(), barBottom, bgTomorrowPaint)
        }

        fun hourToX(absHour: Float): Float = ((absHour - windowStartHour) / 12f) * widthPx

        val todayBlockPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = outageTodayColor
        }
        for (block in todayBlocks) {
            val startH = block.leftRatio * 24f
            val endH = (block.leftRatio + block.widthRatio) * 24f
            val left = hourToX(startH).coerceIn(0f, widthPx.toFloat())
            val right = hourToX(endH).coerceIn(left, widthPx.toFloat())
            if (right > left) {
                canvas.drawRect(left, barTop, right, barBottom, todayBlockPaint)
            }
        }

        if (hasTomorrow) {
            val tomorrowBlockPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.FILL
                color = outageTomorrowColor
            }
            for (block in tomorrowBlocks) {
                val startH = 24f + block.leftRatio * 24f
                val endH = 24f + (block.leftRatio + block.widthRatio) * 24f
                val left = hourToX(startH).coerceIn(0f, widthPx.toFloat())
                val right = hourToX(endH).coerceIn(left, widthPx.toFloat())
                if (right > left) {
                    canvas.drawRect(left, barTop, right, barBottom, tomorrowBlockPaint)
                }
            }
        }

        val hourLinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            color = dividerLineColor
            strokeWidth = 2f
        }
        for (h in (windowStartHour + 1) until windowEndHour) {
            if (h == 24) continue
            val x = hourToX(h.toFloat())
            canvas.drawLine(x, barTop, x, barBottom, hourLinePaint)
        }

        if (hasTomorrow && windowStartHour < 24 && windowEndHour > 24) {
            val splitX = hourToX(24f)
            val divPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                color = dayDividerColor
                strokeWidth = 5f
            }
            canvas.drawLine(splitX, barTop, splitX, barBottom, divPaint)
        }

        val nowHour = nowRatio.coerceIn(0f, 1f) * 24f
        if (nowHour >= windowStartHour && nowHour <= windowEndHour) {
            val nowX = hourToX(nowHour).coerceIn(3f, widthPx - 3f)
            val nowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.FILL
                color = nowMarkerColor
            }
            canvas.drawRect(nowX - 2.5f, barTop, nowX + 2.5f, barBottom, nowPaint)
        }

        canvas.restore()

        val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = tickTextColor
            textSize = heightPx * 0.30f
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
            textAlign = Paint.Align.CENTER
        }
        val labelY = heightPx - 6f

        val firstTick = ceil(windowStartHour.toDouble() / stepHours).toInt() * stepHours
        val lastTick = floor(windowEndHour.toDouble() / stepHours).toInt() * stepHours

        var tickHour = firstTick
        while (tickHour <= lastTick) {
            val x = hourToX(tickHour.toFloat())
            if (tickHour == 24 && hasTomorrow && windowStartHour < 24 && windowEndHour > 24) {
                val splitPaint = Paint(labelPaint).apply {
                    color = outageTomorrowColor
                    typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                }
                canvas.drawText("ЗВТ", x.coerceIn(24f, widthPx - 24f), labelY, splitPaint)
            } else {
                val displayHour = if (tickHour == 24 && (!hasTomorrow || windowEndHour == 24)) {
                    24
                } else if (tickHour == 48) {
                    24
                } else {
                    tickHour % 24
                }
                val label = "%02d".format(displayHour)
                when {
                    tickHour == windowStartHour -> {
                        labelPaint.textAlign = Paint.Align.LEFT
                        canvas.drawText(label, 0f, labelY, labelPaint)
                    }
                    tickHour == windowEndHour -> {
                        labelPaint.textAlign = Paint.Align.RIGHT
                        canvas.drawText(label, widthPx.toFloat(), labelY, labelPaint)
                    }
                    else -> {
                        labelPaint.textAlign = Paint.Align.CENTER
                        canvas.drawText(label, x, labelY, labelPaint)
                    }
                }
            }
            tickHour += stepHours
        }

        return bitmap
    }

    /**
     * Renders a static 12h mini-timeline (2h ticks, no scroll arrows) for "Було / Стало"
     * in expanded outage push notifications.
     */
    fun renderMiniDiffTimelineBitmap(
        context: Context,
        slots: List<OutageSlotData>,
        isTomorrow: Boolean,
        windowStartHour: Int,
        widthPx: Int = 560,
        heightPx: Int = 54
    ): Bitmap {
        val bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val bgColor = ContextCompat.getColor(
            context,
            if (isTomorrow) R.color.bg_outage_bar_track else R.color.bg_gauge_track
        )
        val slotColor = ContextCompat.getColor(
            context,
            if (isTomorrow) R.color.accent_discharge else R.color.accent_outage
        )
        val dividerColor = ContextCompat.getColor(context, R.color.timeline_hour_divider)
        val tickColor = ContextCompat.getColor(context, R.color.text_muted)

        val barHeight = heightPx * 0.42f
        val barTop = 2f
        val barBottom = barTop + barHeight
        val cornerRadius = barHeight * 0.45f

        val startClamped = windowStartHour.coerceIn(0, 12)
        val endHour = startClamped + 12

        val barClip = Path().apply {
            addRoundRect(
                RectF(0f, barTop, widthPx.toFloat(), barBottom),
                cornerRadius,
                cornerRadius,
                Path.Direction.CW
            )
        }

        canvas.save()
        canvas.clipPath(barClip)

        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = bgColor
        }
        canvas.drawRect(0f, barTop, widthPx.toFloat(), barBottom, bgPaint)

        fun hourToX(h: Float): Float = ((h - startClamped) / 12f) * widthPx

        val blockPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = slotColor
        }
        for (block in MarstekStore.toDayBlocks(slots)) {
            val sH = block.leftRatio * 24f
            val eH = (block.leftRatio + block.widthRatio) * 24f
            val left = hourToX(sH).coerceIn(0f, widthPx.toFloat())
            val right = hourToX(eH).coerceIn(left, widthPx.toFloat())
            if (right > left) {
                canvas.drawRect(left, barTop, right, barBottom, blockPaint)
            }
        }

        val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            color = dividerColor
            strokeWidth = 1.5f
        }
        for (h in (startClamped + 1) until endHour) {
            val x = hourToX(h.toFloat())
            canvas.drawLine(x, barTop, x, barBottom, linePaint)
        }

        canvas.restore()

        val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = tickColor
            textSize = heightPx * 0.30f
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
        }
        val labelY = heightPx - 4f

        val firstTick = ceil(startClamped / 2.0).toInt() * 2
        val lastTick = floor(endHour / 2.0).toInt() * 2
        var tick = firstTick
        while (tick <= lastTick) {
            val x = hourToX(tick.toFloat())
            val label = "%02d".format(tick)
            when {
                tick == startClamped -> {
                    labelPaint.textAlign = Paint.Align.LEFT
                    canvas.drawText(label, 0f, labelY, labelPaint)
                }
                tick == endHour -> {
                    labelPaint.textAlign = Paint.Align.RIGHT
                    canvas.drawText(label, widthPx.toFloat(), labelY, labelPaint)
                }
                else -> {
                    labelPaint.textAlign = Paint.Align.CENTER
                    canvas.drawText(label, x, labelY, labelPaint)
                }
            }
            tick += 2
        }

        return bitmap
    }
}
