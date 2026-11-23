package com.marstek.widget.worker

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.marstek.widget.data.PreferencesManager
import com.marstek.widget.network.MarstekUdpClient
import com.marstek.widget.receiver.MarstekWidgetProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

class WidgetUpdateWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = PreferencesManager(context)
        val ip = prefs.deviceIp
        val port = prefs.devicePort

        if (ip.isBlank()) {
            return@withContext Result.success()
        }

        val result = MarstekUdpClient.getStatus(ip, port)
        if (result.isSuccess) {
            val status = result.getOrNull()!!
            val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
            val nowFormatted = timeFormat.format(Date())
            prefs.saveLatestStatus(status, nowFormatted)

            withContext(Dispatchers.Main) {
                MarstekWidgetProvider.updateAllWidgets(context)
            }
            Result.success()
        } else {
            Result.retry()
        }
    }

    companion object {
        private const val WORK_NAME = "marstek_widget_periodic_sync"

        fun schedule(context: Context, intervalMinutes: Long = 15) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<WidgetUpdateWorker>(
                intervalMinutes, TimeUnit.MINUTES
            )
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request
            )
        }
    }
}
