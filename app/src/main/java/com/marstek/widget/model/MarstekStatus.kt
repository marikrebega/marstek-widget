package com.marstek.widget.model

import org.json.JSONObject

data class MarstekStatus(
    val batSoc: Int,
    val batCap: Int = 0,
    val pvPower: Int = 0,
    val onGridPower: Int = 0,
    val offGridPower: Int = 0,
    val totalPvEnergy: Long = 0,
    val totalGridOutputEnergy: Long = 0,
    val totalGridInputEnergy: Long = 0,
    val timestamp: Long = System.currentTimeMillis()
) {
    val isCharging: Boolean get() = onGridPower > 50
    val isDischarging: Boolean get() = onGridPower < -50

    companion object {
        fun fromJson(jsonStr: String): MarstekStatus {
            val root = JSONObject(jsonStr)
            val result = if (root.has("result")) {
                root.getJSONObject("result")
            } else if (root.has("last_success_payload")) {
                root.getJSONObject("last_success_payload").optJSONObject("result") ?: root
            } else {
                root
            }

            return MarstekStatus(
                batSoc = result.optInt("bat_soc", 0),
                batCap = result.optInt("bat_cap", 0),
                pvPower = result.optInt("pv_power", 0),
                onGridPower = result.optInt("ongrid_power", 0),
                offGridPower = result.optInt("offgrid_power", 0),
                totalPvEnergy = result.optLong("total_pv_energy", 0L),
                totalGridOutputEnergy = result.optLong("total_grid_output_energy", 0L),
                totalGridInputEnergy = result.optLong("total_grid_input_energy", 0L)
            )
        }
    }
}
