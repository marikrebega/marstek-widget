package com.marstek.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import kotlin.math.ceil
import kotlin.math.floor

object WidgetGraphics {

    private const val TRACK_COLOR = 0xFF2A2F35.toInt()
    private const val TODAY_BAR_BG = 0xFF242A32.toInt()
    private const val TOMORROW_BAR_BG = 0xFF1E2630.toInt()
    private const val OUTAGE_COLOR = 0xFFFFC24D.toInt()
    private const val OUTAGE_TOMORROW_COLOR = 0xD9FFC24D.toInt()
    private const val DIVIDER_LINE_COLOR = 0x73101316.toInt()
    private const val DAY_DIVIDER_COLOR = 0xCC5AB0FF.toInt()
    private const val NOW_MARKER_COLOR = 0xFFFFFFFF.toInt()
    private const val TICK_TEXT_COLOR = 0xFF8FA3B8.toInt()

    fun renderGaugeBitmap(
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

        val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            color = TRACK_COLOR
            this.strokeWidth = strokeWidth
            strokeCap = Paint.Cap.ROUND
        }
        canvas.drawCircle(cx, cy, radius, trackPaint)

        val clampedSoc = if (hasSoc) soc.coerceIn(0, 100) else 0
        if (clampedSoc > 0) {
            val arcPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                color = mode.colorInt
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
     * with hour dividers, amber outage slots, white "now" marker, day divider ("| ЗВТ"),
     * and adaptive hour tick labels (1h step for >=4 cols, 2h step for <4 cols).
     */
    fun renderScrollableWindowBarBitmap(
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

        val barHeight = heightPx * 0.42f
        val barTop = 2f
        val barBottom = barTop + barHeight
        val cornerRadius = barHeight * 0.45f

        val hasTomorrow = tomorrowBlocks.isNotEmpty()
        val windowEndHour = windowStartHour + 12

        val barClip = android.graphics.Path().apply {
            addRoundRect(
                RectF(0f, barTop, widthPx.toFloat(), barBottom),
                cornerRadius,
                cornerRadius,
                android.graphics.Path.Direction.CW
            )
        }

        canvas.save()
        canvas.clipPath(barClip)

        val bgTodayPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = TODAY_BAR_BG
        }
        val bgTomorrowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = TOMORROW_BAR_BG
        }

        // Fill day background segments
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

        // Today outage blocks (hours 0..24)
        val todayBlockPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = OUTAGE_COLOR
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

        // Tomorrow outage blocks (hours 24..48)
        if (hasTomorrow) {
            val tomorrowBlockPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.FILL
                color = OUTAGE_TOMORROW_COLOR
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

        // Hourly subtle separators
        val hourLinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            color = DIVIDER_LINE_COLOR
            strokeWidth = 2f
        }
        for (h in (windowStartHour + 1) until windowEndHour) {
            if (h == 24) continue
            val x = hourToX(h.toFloat())
            canvas.drawLine(x, barTop, x, barBottom, hourLinePaint)
        }

        // Day divider at hour 24 when crossing into tomorrow
        if (hasTomorrow && windowStartHour < 24 && windowEndHour > 24) {
            val splitX = hourToX(24f)
            val divPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                color = DAY_DIVIDER_COLOR
                strokeWidth = 5f
            }
            canvas.drawLine(splitX, barTop, splitX, barBottom, divPaint)
        }

        // White "now" marker on today's 0..24 range
        val nowHour = nowRatio.coerceIn(0f, 1f) * 24f
        if (nowHour >= windowStartHour && nowHour <= windowEndHour) {
            val nowX = hourToX(nowHour).coerceIn(3f, widthPx - 3f)
            val nowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.FILL
                color = NOW_MARKER_COLOR
            }
            canvas.drawRect(nowX - 2.5f, barTop, nowX + 2.5f, barBottom, nowPaint)
        }

        canvas.restore()

        // Tick labels row below the bar
        val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = TICK_TEXT_COLOR
            textSize = heightPx * 0.28f
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
            textAlign = Paint.Align.CENTER
        }
        val labelY = heightPx - 7f

        val firstTick = ceil(windowStartHour.toDouble() / stepHours).toInt() * stepHours
        val lastTick = floor(windowEndHour.toDouble() / stepHours).toInt() * stepHours

        var tickHour = firstTick
        while (tickHour <= lastTick) {
            val x = hourToX(tickHour.toFloat())
            if (tickHour == 24 && hasTomorrow && windowStartHour < 24 && windowEndHour > 24) {
                val splitPaint = Paint(labelPaint).apply {
                    color = 0xFF5AB0FF.toInt()
                    typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                }
                canvas.drawText("ЗВТ", x.coerceIn(22f, widthPx - 22f), labelY, splitPaint)
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
}
