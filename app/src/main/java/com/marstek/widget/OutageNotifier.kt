package com.marstek.widget

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

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
        val diff = MarstekStore.evaluateOutageChangesAndSaveBaseline(
            context = context,
            providerId = config.providerId,
            group = config.group,
            todayDateLabel = outcome.todayDateLabel,
            todayJson = outcome.todayJson,
            tomorrowDateLabel = outcome.tomorrowDateLabel,
            tomorrowJson = outcome.tomorrowJson
        )

        if (!config.notifyOutages || !hasPermission(context)) {
            return diff.todayChanged || diff.tomorrowAppeared || diff.tomorrowChanged
        }

        if (diff.todayChanged) {
            val summary = formatSlotsSummary(diff.todaySlots)
            postNotification(
                context = context,
                notificationId = NOTIF_ID_TODAY,
                title = "Оновлено графік на сьогодні (Черга ${config.group})",
                body = summary
            )
        }

        if (diff.tomorrowAppeared || diff.tomorrowChanged) {
            val title = if (diff.tomorrowAppeared) {
                "З’явився графік на завтра (Черга ${config.group})"
            } else {
                "Оновлено графік на завтра (Черга ${config.group})"
            }
            val summary = formatSlotsSummary(diff.tomorrowSlots)
            postNotification(
                context = context,
                notificationId = NOTIF_ID_TOMORROW,
                title = title,
                body = summary
            )
        }

        return diff.todayChanged || diff.tomorrowAppeared || diff.tomorrowChanged
    }

    fun sendTestNotification(context: Context): Boolean {
        if (!hasPermission(context)) return false
        val config = MarstekStore.loadConfig(context)
        val (todaySlots, _) = MarstekStore.loadCachedOutages(context)
        val body = if (todaySlots.isEmpty()) {
            "Сповіщення активні · Черга ${config.group} (сьогодні без відключень)"
        } else {
            "Сповіщення активні · ${formatSlotsSummary(todaySlots)}"
        }
        postNotification(
            context = context,
            notificationId = NOTIF_ID_TEST,
            title = "Marstek · Черга ${config.group}",
            body = body
        )
        return true
    }

    private fun formatSlotsSummary(slots: List<OutageSlotData>): String {
        if (slots.isEmpty()) return "Відключень не заплановано"
        return slots.joinToString(", ") { "${it.start}–${it.end}" }
    }

    private fun postNotification(
        context: Context,
        notificationId: Int,
        title: String,
        body: String
    ) {
        ensureChannel(context)
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_mode_charging)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context).notify(notificationId, notification)
    }
}
