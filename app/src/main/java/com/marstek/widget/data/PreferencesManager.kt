package com.marstek.widget.data

import android.content.Context
import android.content.SharedPreferences
import com.marstek.widget.model.MarstekStatus

class PreferencesManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("marstek_widget_prefs", Context.MODE_PRIVATE)

    var deviceIp: String
        get() = prefs.getString(KEY_DEVICE_IP, "") ?: ""
        set(value) = prefs.edit().putString(KEY_DEVICE_IP, value.trim()).apply()

    var devicePort: Int
        get() = prefs.getInt(KEY_DEVICE_PORT, 30000)
        set(value) = prefs.edit().putInt(KEY_DEVICE_PORT, value).apply()

    var lastCachedSoc: Int
        get() = prefs.getInt(KEY_LAST_SOC, -1)
        set(value) = prefs.edit().putInt(KEY_LAST_SOC, value).apply()

    var lastCachedPv: Int
        get() = prefs.getInt(KEY_LAST_PV, 0)
        set(value) = prefs.edit().putInt(KEY_LAST_PV, value).apply()

    var lastCachedGrid: Int
        get() = prefs.getInt(KEY_LAST_GRID, 0)
        set(value) = prefs.edit().putInt(KEY_LAST_GRID, value).apply()

    var lastUpdateTime: String
        get() = prefs.getString(KEY_LAST_UPDATE_TIME, "--:--") ?: "--:--"
        set(value) = prefs.edit().putString(KEY_LAST_UPDATE_TIME, value).apply()

    fun saveLatestStatus(status: MarstekStatus, formattedTime: String) {
        prefs.edit()
            .putInt(KEY_LAST_SOC, status.batSoc)
            .putInt(KEY_LAST_PV, status.pvPower)
            .putInt(KEY_LAST_GRID, status.onGridPower)
            .putString(KEY_LAST_UPDATE_TIME, formattedTime)
            .apply()
    }

    companion object {
        private const val KEY_DEVICE_IP = "pref_device_ip"
        private const val KEY_DEVICE_PORT = "pref_device_port"
        private const val KEY_LAST_SOC = "pref_last_soc"
        private const val KEY_LAST_PV = "pref_last_pv"
        private const val KEY_LAST_GRID = "pref_last_grid"
        private const val KEY_LAST_UPDATE_TIME = "pref_last_update_time"
    }
}
