package com.marstek.widget

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import java.util.concurrent.Executors

/**
 * Lightweight 30-minute periodic JobService checking outage schedule changes
 * only when outage notifications are enabled. Does not run any foreground service
 * or screen-unlock listener.
 */
class OutageMonitorJobService : JobService() {

    private val executor = Executors.newSingleThreadExecutor()

    override fun onStartJob(params: JobParameters?): Boolean {
        val appContext = applicationContext
        val config = MarstekStore.loadConfig(appContext)
        if (!config.notifyOutages) {
            return false
        }

        executor.execute {
            try {
                val outcome = MarstekClient.fetchOutages(config.providerId, config.group)
                MarstekStore.saveOutagesJson(appContext, outcome.todayJson, outcome.tomorrowJson)
                val changed = OutageNotifier.processOutageUpdate(appContext, config, outcome)
                if (changed) {
                    MarstekWidgetUpdater.updateAllFromCache(appContext, isUpdating = false)
                }
            } catch (_: Exception) {
            } finally {
                jobFinished(params, false)
            }
        }
        return true
    }

    override fun onStopJob(params: JobParameters?): Boolean {
        return true
    }

    override fun onDestroy() {
        super.onDestroy()
        executor.shutdownNow()
    }

    companion object {
        private const val JOB_ID = 7021
        private const val PERIOD_MS = 30L * 60L * 1000L

        fun syncSchedule(context: Context, enabled: Boolean) {
            val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
            if (!enabled) {
                scheduler.cancel(JOB_ID)
                return
            }

            val existing = scheduler.getPendingJob(JOB_ID)
            if (existing != null) return

            val component = ComponentName(context.applicationContext, OutageMonitorJobService::class.java)
            val jobInfo = JobInfo.Builder(JOB_ID, component)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(PERIOD_MS)
                .setPersisted(true)
                .build()
            scheduler.schedule(jobInfo)
        }
    }
}
