package com.marstek.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import kotlin.math.cos
import kotlin.math.sin

object WidgetGraphics {

    private const val TRACK_COLOR = 0xFF2A2F35.toInt()
    private const val TICK_COLOR = 0xFFF2F4F5.toInt()
    private const val OUTAGE_COLOR = 0xFFFFC24D.toInt()
    private const val NOW_MARKER_COLOR = 0xFFFFFFFF.toInt()

    fun renderGaugeBitmap(
        soc: Int,
        hasSoc: Boolean,
        mode: BatteryMode,
        dischargeLimit: Int,
        chargeLimit: Int,
        showLimitTicks: Boolean,
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

        if (showLimitTicks) {
            val tickPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                color = TICK_COLOR
                this.strokeWidth = (sizePx * 0.016f).coerceAtLeast(3f)
                strokeCap = Paint.Cap.ROUND
            }
            val innerR = radius - strokeWidth * 0.85f
            val outerR = radius + strokeWidth * 0.85f

            fun drawTick(pct: Int) {
                val angleRad = Math.toRadians((-90.0) + (pct.coerceIn(0, 100) / 100.0) * 360.0)
                val cosA = cos(angleRad).toFloat()
                val sinA = sin(angleRad).toFloat()
                canvas.drawLine(
                    cx + innerR * cosA,
                    cy + innerR * sinA,
                    cx + outerR * cosA,
                    cy + outerR * sinA,
                    tickPaint
                )
            }

            drawTick(dischargeLimit)
            drawTick(chargeLimit)
        }

        return bitmap
    }

    fun renderOutageBarBitmap(
        blocks: List<OutageBlockRatio>,
        nowRatio: Float,
        widthPx: Int = 640,
        heightPx: Int = 36
    ): Bitmap {
        val bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val cornerRadius = heightPx / 2f
        val path = android.graphics.Path().apply {
            addRoundRect(
                RectF(0f, 0f, widthPx.toFloat(), heightPx.toFloat()),
                cornerRadius,
                cornerRadius,
                android.graphics.Path.Direction.CW
            )
        }
        canvas.clipPath(path)

        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = TRACK_COLOR
        }
        canvas.drawRect(0f, 0f, widthPx.toFloat(), heightPx.toFloat(), bgPaint)

        val blockPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = OUTAGE_COLOR
        }
        for (block in blocks) {
            val left = (block.leftRatio * widthPx).coerceIn(0f, widthPx.toFloat())
            val right = ((block.leftRatio + block.widthRatio) * widthPx).coerceIn(left, widthPx.toFloat())
            if (right > left) {
                canvas.drawRect(left, 0f, right, heightPx.toFloat(), blockPaint)
            }
        }

        val markerWidth = (widthPx * 0.008f).coerceAtLeast(4f)
        val markerLeft = (nowRatio.coerceIn(0f, 1f) * widthPx - markerWidth / 2f)
            .coerceIn(0f, widthPx - markerWidth)
        val markerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = NOW_MARKER_COLOR
        }
        canvas.drawRect(markerLeft, 0f, markerLeft + markerWidth, heightPx.toFloat(), markerPaint)

        return bitmap
    }
}
