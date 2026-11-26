package com.marstek.widget

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import kotlin.math.roundToInt

object OutageNotifier {

    const val CHANNEL_ID = "outage_updates"
    private const val NOTIF_ID_TODAY = 4101
    private const val NOTIF_ID_TOMORROW = 4102
    private const val NOTIF_ID_TEST = 4103

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val existing = manager.getNotificationChannel(CHANNEL_ID)
            if (existing == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Зміни графіка відключень",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Сповіщення при зміні слотів відключень світла на сьогодні або появі графіка на завтра"
                }
                manager.createNotificationChannel(channel)
            }
        }
    }

    fun hasPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun processOutageUpdate(
        context: Context,
        config: MarstekConfig,
        outcome: MarstekClient.OutageFetchOutcome
    ): Boolean {
        val result = MarstekStore.evaluateOutageChangesAndSaveBaseline(
            context = context,
            providerId = config.providerId,
            group = config.group,
            todayDateLabel = outcome.todayDateLabel,
            todayJson = outcome.todayJson,
            tomorrowDateLabel = outcome.tomorrowDateLabel,
            tomorrowJson = outcome.tomorrowJson
        )

        if (!config.notifyOutages || !hasPermission(context)) {
            return result.todayChanged || result.tomorrowAppeared || result.tomorrowChanged
        }

        if (result.todayChanged) {
            val collapsed = buildCollapsedDiffBody(result.todayDiff, result.todaySlots)
            postRichNotification(
                context = context,
                notificationId = NOTIF_ID_TODAY,
                title = "Оновлено графік на сьогодні (Черга ${config.group})",
                collapsedBody = collapsed,
                diff = result.todayDiff,
                prevSlots = result.todayPrevSlots,
                newSlots = result.todaySlots,
                isTomorrow = false,
                showBeforeTimeline = true
            )
        }

        if (result.tomorrowAppeared || result.tomorrowChanged) {
            val title = if (result.tomorrowAppeared) {
                "З’явився графік на завтра (Черга ${config.group})"
            } else {
                "Оновлено графік на завтра (Черга ${config.group})"
            }
            val collapsed = if (result.tomorrowAppeared) {
                buildTomorrowAppearedCollapsedBody(result.tomorrowSlots)
            } else {
                buildCollapsedDiffBody(result.tomorrowDiff, result.tomorrowSlots)
            }
            postRichNotification(
                context = context,
                notificationId = NOTIF_ID_TOMORROW,
                title = title,
                collapsedBody = collapsed,
                diff = result.tomorrowDiff,
                prevSlots = result.tomorrowPrevSlots,
                newSlots = result.tomorrowSlots,
                isTomorrow = true,
                showBeforeTimeline = !result.tomorrowAppeared && result.tomorrowPrevSlots.isNotEmpty()
            )
        }

        return result.todayChanged || result.tomorrowAppeared || result.tomorrowChanged
    }

    fun sendTestNotification(context: Context): Boolean {
        if (!hasPermission(context)) return false
        val config = MarstekStore.loadConfig(context)
        val (todaySlots, _) = MarstekStore.loadCachedOutages(context)
        val collapsed = if (todaySlots.isEmpty()) {
            "Сповіщення активні · Відключень не заплановано"
        } else {
            "Сповіщення активні · ${formatSlotsSummary(todaySlots)}"
        }
        val sampleDiff = if (todaySlots.isNotEmpty()) {
            OutageDiffSummary(added = todaySlots.take(1))
        } else {
            OutageDiffSummary()
        }
        postRichNotification(
            context = context,
            notificationId = NOTIF_ID_TEST,
            title = "Marstek · Черга ${config.group}",
            collapsedBody = collapsed,
            diff = sampleDiff,
            prevSlots = emptyList(),
            newSlots = todaySlots,
            isTomorrow = false,
            showBeforeTimeline = false
        )
        return true
    }

    private fun buildTomorrowAppearedCollapsedBody(slots: List<OutageSlotData>): String {
        if (slots.isEmpty()) return "Відключень не заплановано"
        val totalMin = MarstekStore.totalOutageMinutes(slots)
        val totalHoursStr = formatTotalHoursUk(totalMin)
        val countWord = formatOutagesCountUk(slots.size)
        return "$countWord: ${formatSlotsSummary(slots)} · разом $totalHoursStr"
    }

    private fun buildCollapsedDiffBody(
        diff: OutageDiffSummary,
        newSlots: List<OutageSlotData>
    ): String {
        if (newSlots.isEmpty() && diff.removed.isEmpty() && diff.changed.isEmpty()) {
            return "Відключень не заплановано"
        }
        val parts = mutableListOf<String>()
        if (diff.added.isNotEmpty()) {
            parts.add("Додано ${diff.added.joinToString(", ") { "${it.start}–${it.end}" }}")
        }
        if (diff.removed.isNotEmpty()) {
            parts.add("Прибрано ${diff.removed.joinToString(", ") { "${it.start}–${it.end}" }}")
        }
        if (diff.changed.isNotEmpty()) {
            parts.add(
                "Змінено ${
                    diff.changed.joinToString(", ") {
                        "${it.oldSlot.start}–${it.oldSlot.end} → ${it.newSlot.start}–${it.newSlot.end}"
                    }
                }"
            )
        }
        return if (parts.isNotEmpty()) {
            parts.joinToString(" · ")
        } else {
            formatSlotsSummary(newSlots)
        }
    }

    private fun buildExpandedDiffSpannable(
        context: Context,
        diff: OutageDiffSummary,
        newSlots: List<OutageSlotData>
    ): CharSequence {
        val sb = SpannableStringBuilder()
        val amber = ContextCompat.getColor(context, R.color.accent_outage)
        val green = ContextCompat.getColor(context, R.color.accent_primary)
        val blue = ContextCompat.getColor(context, R.color.accent_discharge)
        val primaryText = ContextCompat.getColor(context, R.color.text_primary)
        val mutedText = ContextCompat.getColor(context, R.color.text_muted)

        fun appendLabeledLine(label: String, labelColor: Int, buildValue: () -> Unit) {
            if (sb.isNotEmpty()) sb.append("\n")
            val start = sb.length
            sb.append(label)
            sb.setSpan(ForegroundColorSpan(labelColor), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            sb.setSpan(StyleSpan(Typeface.BOLD), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            sb.append("  ")
            buildValue()
        }

        if (diff.added.isNotEmpty()) {
            appendLabeledLine("Додано", amber) {
                val valStart = sb.length
                sb.append(diff.added.joinToString(", ") { "${it.start}–${it.end}" })
                sb.setSpan(ForegroundColorSpan(primaryText), valStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }

        if (diff.removed.isNotEmpty()) {
            appendLabeledLine("Прибрано", green) {
                val valStart = sb.length
                sb.append(diff.removed.joinToString(", ") { "${it.start}–${it.end}" })
                sb.setSpan(ForegroundColorSpan(mutedText), valStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                sb.setSpan(StrikethroughSpan(), valStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }

        if (diff.changed.isNotEmpty()) {
            appendLabeledLine("Змінено", blue) {
                val valStart = sb.length
                sb.append(
                    diff.changed.joinToString(", ") {
                        "${it.oldSlot.start}–${it.oldSlot.end} → ${it.newSlot.start}–${it.newSlot.end}"
                    }
                )
                sb.setSpan(ForegroundColorSpan(primaryText), valStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }

        if (sb.isEmpty()) {
            sb.append(formatSlotsSummary(newSlots))
        }
        return sb
    }

    private fun resolveDiffWindowStartHour(
        diff: OutageDiffSummary,
        prevSlots: List<OutageSlotData>,
        newSlots: List<OutageSlotData>
    ): Int {
        val focusSlot = diff.added.firstOrNull()
            ?: diff.changed.firstOrNull()?.newSlot
            ?: diff.removed.firstOrNull()
            ?: newSlots.firstOrNull()
            ?: prevSlots.firstOrNull()
        val focusHour = focusSlot?.let { MarstekStore.timeToMinutes(it.start) / 60 } ?: 8
        return (focusHour - 3).coerceIn(0, 12)
    }

    private fun formatSlotsSummary(slots: List<OutageSlotData>): String {
        if (slots.isEmpty()) return "Відключень не заплановано"
        return slots.joinToString(", ") { "${it.start}–${it.end}" }
    }

    private fun formatTotalHoursUk(totalMinutes: Int): String {
        val h = totalMinutes / 60
        val m = totalMinutes % 60
        return if (m == 0) "$h год" else "$h год ${"%02d".format(m)} хв"
    }

    private fun formatOutagesCountUk(count: Int): String {
        val mod10 = count % 10
        val mod100 = count % 100
        val word = when {
            mod10 == 1 && mod100 != 11 -> "відключення"
            mod10 in 2..4 && mod100 !in 12..14 -> "відключення"
            else -> "відключень"
        }
        return "$count $word"
    }

    private fun postRichNotification(
        context: Context,
        notificationId: Int,
        title: String,
        collapsedBody: String,
        diff: OutageDiffSummary,
        prevSlots: List<OutageSlotData>,
        newSlots: List<OutageSlotData>,
        isTomorrow: Boolean,
        showBeforeTimeline: Boolean
    ) {
        ensureChannel(context)
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPi = PendingIntent.getActivity(
            context,
            notificationId * 10 + 1,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val disableIntent = Intent(context, OutageNotificationReceiver::class.java).apply {
            action = OutageNotificationReceiver.ACTION_DISABLE_OUTAGE_NOTIFS
        }
        val disablePi = PendingIntent.getBroadcast(
            context,
            notificationId * 10 + 2,
            disableIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val expandedViews = RemoteViews(context.packageName, R.layout.notification_outage_expanded).apply {
            setTextViewText(R.id.notifTitle, title)
            setTextViewText(R.id.notifDiffSummary, buildExpandedDiffSpannable(context, diff, newSlots))

            val windowStart = resolveDiffWindowStartHour(diff, prevSlots, newSlots)
            if (showBeforeTimeline) {
                setViewVisibility(R.id.notifBeforeRow, View.VISIBLE)
                val beforeBmp = WidgetGraphics.renderMiniDiffTimelineBitmap(
                    context = context,
                    slots = prevSlots,
                    isTomorrow = isTomorrow,
                    windowStartHour = windowStart
                )
                setImageViewBitmap(R.id.notifBeforeBar, beforeBmp)
            } else {
                setViewVisibility(R.id.notifBeforeRow, View.GONE)
            }

            if (newSlots.isNotEmpty() || showBeforeTimeline) {
                setViewVisibility(R.id.notifTimelinesContainer, View.VISIBLE)
                val afterBmp = WidgetGraphics.renderMiniDiffTimelineBitmap(
                    context = context,
                    slots = newSlots,
                    isTomorrow = isTomorrow,
                    windowStartHour = windowStart
                )
                setImageViewBitmap(R.id.notifAfterBar, afterBmp)
            } else {
                setViewVisibility(R.id.notifTimelinesContainer, View.GONE)
            }
        }

        val accentGreen = ContextCompat.getColor(context, R.color.accent_primary)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notif_bolt)
            .setColor(accentGreen)
            .setContentTitle(title)
            .setContentText(collapsedBody)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomBigContentView(expandedViews)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(openPi)
            .addAction(0, "Відкрити", openPi)
            .addAction(0, "Вимкнути сповіщення", disablePi)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context).notify(notificationId, notification)
    }
}
