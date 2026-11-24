package com.marstek.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

enum class BatteryMode(val labelUk: String, val colorInt: Int) {
    CHARGING("Заряджається", 0xFF3DDC84.toInt()),
    DISCHARGING("Розряджається", 0xFF5AB0FF.toInt()),
    IDLE("Очікування", 0xFF8FA3B8.toInt())
}

data class MarstekConfig(
    val ip: String,
    val port: Int,
    val dischargeLimit: Int,
    val chargeLimit: Int,
    val providerId: String,
    val group: String
)

data class MarstekStatusData(
    val batSoc: Int,
    val batCap: Int,
    val pvPower: Int,
    val onGridPower: Int,
    val offGridPower: Int,
    val totalPvEnergy: Long,
    val totalGridOutputEnergy: Long,
    val totalGridInputEnergy: Long,
    val totalLoadEnergy: Long,
    val deviceName: String,
    val workMode: String,
    val timestamp: Long
)

data class OutageSlotData(
    val id: String,
    val start: String,
    val end: String
)

data class EnergyDurationsUi(
    val mode: BatteryMode,
    val cardTitle: String,
    val leftLabel: String,
    val rightLabel: String,
    val withLimitsText: String,
    val withoutLimitsText: String,
    val compactSubText: String
)

data class OutageBlockRatio(
    val leftRatio: Float,
    val widthRatio: Float
)

data class OutageSummaryUi(
    val rangeText: String,
    val countdownText: String,
    val compactCountdownText: String,
    val nowRatio: Float,
    val blocks: List<OutageBlockRatio>
)

object MarstekStore {
    private const val PREFS_NAME = "marstek_widget_prefs"

    private const val KEY_IP = "device_ip"
    private const val KEY_PORT = "device_port"
    private const val KEY_DISCHARGE_LIMIT = "discharge_limit"
    private const val KEY_CHARGE_LIMIT = "charge_limit"
    private const val KEY_PROVIDER_ID = "provider_id"
    private const val KEY_GROUP = "outage_group"

    private const val KEY_LAST_SOC = "last_soc"
    private const val KEY_LAST_CAP = "last_cap"
    private const val KEY_LAST_PV = "last_pv"
    private const val KEY_LAST_GRID = "last_grid"
    private const val KEY_LAST_OFFGRID = "last_offgrid"
    private const val KEY_LAST_DEVICE = "last_device_name"
    private const val KEY_LAST_WORK_MODE = "last_work_mode"
    private const val KEY_LAST_UPDATE = "last_update_time"
    private const val KEY_LAST_ERROR = "last_is_error"

    private const val KEY_OUTAGE_TODAY = "outage_today_json"
    private const val KEY_OUTAGE_TOMORROW = "outage_tomorrow_json"
    private const val KEY_USER_PRESENT_TS = "last_user_present_ts"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun loadConfig(context: Context): MarstekConfig {
        val p = prefs(context)
        val ip = p.getString(KEY_IP, "192.168.0.190")?.trim().orEmpty().ifEmpty { "192.168.0.190" }
        val port = p.getInt(KEY_PORT, 30000).let { if (it in 1..65535) it else 30000 }
        val discharge = p.getInt(KEY_DISCHARGE_LIMIT, 10).coerceIn(0, 50)
        val charge = p.getInt(KEY_CHARGE_LIMIT, 90).coerceIn(50, 100)
        val provider = p.getString(KEY_PROVIDER_ID, "prykarpattya-oe").orEmpty().ifEmpty { "prykarpattya-oe" }
        val group = p.getString(KEY_GROUP, "1.1").orEmpty().ifEmpty { "1.1" }
        return MarstekConfig(ip, port, discharge, charge, provider, group)
    }

    fun saveConfig(
        context: Context,
        ip: String,
        port: Int,
        dischargeLimit: Int,
        chargeLimit: Int,
        providerId: String,
        group: String
    ) {
        prefs(context).edit()
            .putString(KEY_IP, ip.trim().ifEmpty { "192.168.0.190" })
            .putInt(KEY_PORT, if (port in 1..65535) port else 30000)
            .putInt(KEY_DISCHARGE_LIMIT, dischargeLimit.coerceIn(0, 50))
            .putInt(KEY_CHARGE_LIMIT, chargeLimit.coerceIn(50, 100))
            .putString(KEY_PROVIDER_ID, providerId.ifEmpty { "prykarpattya-oe" })
            .putString(KEY_GROUP, group.ifEmpty { "1.1" })
            .apply()
    }

    fun saveStatus(context: Context, status: MarstekStatusData) {
        val timeText = ZonedDateTime.now(ZoneId.of("Europe/Kyiv"))
            .format(DateTimeFormatter.ofPattern("HH:mm"))
        prefs(context).edit()
            .putInt(KEY_LAST_SOC, status.batSoc)
            .putInt(KEY_LAST_CAP, status.batCap)
            .putInt(KEY_LAST_PV, status.pvPower)
            .putInt(KEY_LAST_GRID, status.onGridPower)
            .putInt(KEY_LAST_OFFGRID, status.offGridPower)
            .putString(KEY_LAST_DEVICE, status.deviceName)
            .putString(KEY_LAST_WORK_MODE, status.workMode)
            .putString(KEY_LAST_UPDATE, timeText)
            .putBoolean(KEY_LAST_ERROR, false)
            .apply()
    }

    fun markStatusError(context: Context) {
        prefs(context).edit().putBoolean(KEY_LAST_ERROR, true).apply()
    }

    data class CachedStatus(
        val soc: Int,
        val batCap: Int,
        val pvPower: Int,
        val onGridPower: Int,
        val offGridPower: Int,
        val deviceName: String,
        val workMode: String,
        val lastUpdateTime: String,
        val isError: Boolean
    )

    fun loadCachedStatus(context: Context): CachedStatus {
        val p = prefs(context)
        return CachedStatus(
            soc = p.getInt(KEY_LAST_SOC, -1),
            batCap = p.getInt(KEY_LAST_CAP, 0),
            pvPower = p.getInt(KEY_LAST_PV, 0),
            onGridPower = p.getInt(KEY_LAST_GRID, 0),
            offGridPower = p.getInt(KEY_LAST_OFFGRID, 0),
            deviceName = p.getString(KEY_LAST_DEVICE, "").orEmpty(),
            workMode = p.getString(KEY_LAST_WORK_MODE, "").orEmpty(),
            lastUpdateTime = p.getString(KEY_LAST_UPDATE, "--:--").orEmpty(),
            isError = p.getBoolean(KEY_LAST_ERROR, false)
        )
    }

    fun saveOutagesJson(context: Context, todayJson: String, tomorrowJson: String) {
        prefs(context).edit()
            .putString(KEY_OUTAGE_TODAY, todayJson)
            .putString(KEY_OUTAGE_TOMORROW, tomorrowJson)
            .apply()
    }

    fun loadCachedOutages(context: Context): Pair<List<OutageSlotData>, List<OutageSlotData>> {
        val p = prefs(context)
        val today = parseSlotsJson(p.getString(KEY_OUTAGE_TODAY, "[]") ?: "[]")
        val tomorrow = parseSlotsJson(p.getString(KEY_OUTAGE_TOMORROW, "[]") ?: "[]")
        return today to tomorrow
    }

    fun shouldAllowUserPresentRefresh(context: Context): Boolean {
        val p = prefs(context)
        val now = System.currentTimeMillis()
        val last = p.getLong(KEY_USER_PRESENT_TS, 0L)
        if (now - last < 60_000L) return false
        p.edit().putLong(KEY_USER_PRESENT_TS, now).apply()
        return true
    }

    private fun parseSlotsJson(jsonStr: String): List<OutageSlotData> {
        return try {
            val arr = JSONArray(jsonStr)
            buildList {
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val start = obj.optString("start")
                    val end = obj.optString("end")
                    if (start.isNotEmpty() && end.isNotEmpty()) {
                        add(OutageSlotData(obj.optString("id", "slot-$i"), start, end))
                    }
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun computeNetBatteryPower(pvPower: Int, onGridPower: Int, offGridPower: Int): Int {
        // Marstek ES.GetStatus: ongrid_power < 0 = charging from grid, > 0 = discharging to grid
        return pvPower - onGridPower - offGridPower
    }

    fun getBatteryMode(netBatteryPower: Int): BatteryMode {
        return when {
            netBatteryPower > 25 -> BatteryMode.CHARGING
            netBatteryPower < -25 -> BatteryMode.DISCHARGING
            else -> BatteryMode.IDLE
        }
    }

    fun formatPowerUk(netBatteryPower: Int): String {
        val absW = abs(netBatteryPower)
        if (absW <= 25) return "0 Вт"
        val sign = if (netBatteryPower > 0) "+" else "−"
        return if (absW >= 1000) {
            val kw = "%.1f".format(absW / 1000.0).replace('.', ',')
            "$sign$kw кВт"
        } else {
            "$sign$absW Вт"
        }
    }

    fun formatDurationUk(totalMinutes: Double): String {
        val clamped = max(0, totalMinutes.roundToInt())
        val hours = clamped / 60
        val mins = clamped % 60
        val minsStr = if (hours > 0) "%02d".format(mins) else mins.toString()
        return "$hours год $minsStr хв"
    }

    fun computeEnergyDurations(
        soc: Int,
        batCapWh: Int,
        netBatteryPower: Int,
        dischargeLimit: Int,
        chargeLimit: Int
    ): EnergyDurationsUi {
        val mode = getBatteryMode(netBatteryPower)
        val capacityWh = if (batCapWh > 0) batCapWh else 2560
        val clampedSoc = soc.coerceIn(0, 100)

        if (mode == BatteryMode.CHARGING) {
            val powerW = max(1, abs(netBatteryPower)).toDouble()
            val toLimitPct = max(0, chargeLimit - clampedSoc)
            val toFullPct = max(0, 100 - clampedSoc)

            val minsToLimit = ((toLimitPct / 100.0) * capacityWh) / powerW * 60.0
            val minsToFull = ((toFullPct / 100.0) * capacityWh) / powerW * 60.0

            val withLimits = if (clampedSoc >= chargeLimit) "Досягнуто" else formatDurationUk(minsToLimit)
            val withoutLimits = if (clampedSoc >= 100) "Заряджено" else formatDurationUk(minsToFull)

            return EnergyDurationsUi(
                mode = mode,
                cardTitle = "До повного заряду",
                leftLabel = "З лімітами (до $chargeLimit%)",
                rightLabel = "Без лімітів (до 100%)",
                withLimitsText = withLimits,
                withoutLimitsText = withoutLimits,
                compactSubText = "до $chargeLimit% · без ліміту $withoutLimits"
            )
        }

        if (mode == BatteryMode.DISCHARGING) {
            val powerW = max(1, abs(netBatteryPower)).toDouble()
            val toLimitPct = max(0, clampedSoc - dischargeLimit)
            val toZeroPct = clampedSoc

            val minsToLimit = ((toLimitPct / 100.0) * capacityWh) / powerW * 60.0
            val minsToZero = ((toZeroPct / 100.0) * capacityWh) / powerW * 60.0

            val withLimits = if (clampedSoc <= dischargeLimit) "Досягнуто" else formatDurationUk(minsToLimit)
            val withoutLimits = if (clampedSoc <= 0) "Розряджено" else formatDurationUk(minsToZero)

            return EnergyDurationsUi(
                mode = mode,
                cardTitle = "До розряду",
                leftLabel = "З лімітами (до $dischargeLimit%)",
                rightLabel = "Без лімітів (до 0%)",
                withLimitsText = withLimits,
                withoutLimitsText = withoutLimits,
                compactSubText = "до $dischargeLimit% · без ліміту $withoutLimits"
            )
        }

        val isAtCharge = clampedSoc >= chargeLimit
        val isAtDischarge = clampedSoc <= dischargeLimit
        val remainingPct = max(0, 100 - clampedSoc)
        val estTopOffMins = ((remainingPct / 100.0) * capacityWh) / 800.0 * 60.0
        val availableWh = (((max(0, clampedSoc - dischargeLimit)) / 100.0) * capacityWh).roundToInt()

        return EnergyDurationsUi(
            mode = mode,
            cardTitle = "Очікування",
            leftLabel = when {
                isAtCharge -> "Ліміт заряду"
                isAtDischarge -> "Ліміт розряду"
                else -> "Режим"
            },
            rightLabel = if (isAtCharge) "Без лімітів (до 100%)" else "Доступний запас",
            withLimitsText = if (isAtCharge || isAtDischarge) "Досягнуто" else "Готово",
            withoutLimitsText = if (isAtCharge) "ще ${formatDurationUk(estTopOffMins)}" else "$availableWh Вт·год",
            compactSubText = if (isAtCharge) "ліміт $chargeLimit% досягнуто" else "запас $availableWh Вт·год"
        )
    }

    fun getKyivMinutesNow(): Int {
        val now = ZonedDateTime.now(ZoneId.of("Europe/Kyiv"))
        return (now.hour % 24) * 60 + now.minute
    }

    private fun timeToMinutes(hhmm: String): Int {
        val parts = hhmm.split(":")
        val h = parts.getOrNull(0)?.toIntOrNull() ?: 0
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        return (h * 60 + m).coerceIn(0, 1440)
    }

    fun evaluateOutageSchedule(
        todaySlots: List<OutageSlotData>,
        nowMinutes: Int,
        tomorrowSlots: List<OutageSlotData>
    ): OutageSummaryUi {
        data class ParsedSlot(val start: String, val end: String, val startMin: Int, val endMin: Int)

        fun normalize(list: List<OutageSlotData>) = list
            .map { ParsedSlot(it.start, it.end, timeToMinutes(it.start), timeToMinutes(it.end)) }
            .filter { it.endMin > it.startMin }
            .sortedBy { it.startMin }

        val clampedNow = nowMinutes.coerceIn(0, 1440)
        val sorted = normalize(todaySlots)
        val sortedTomorrow = normalize(tomorrowSlots)

        val blocks = sorted.map {
            OutageBlockRatio(
                leftRatio = it.startMin / 1440f,
                widthRatio = (it.endMin - it.startMin) / 1440f
            )
        }
        val nowRatio = clampedNow / 1440f

        val current = sorted.firstOrNull { clampedNow in it.startMin until it.endMin }
        if (current != null) {
            val dur = formatDurationUk((current.endMin - clampedNow).toDouble())
            return OutageSummaryUi(
                rangeText = "${current.start} – ${current.end}",
                countdownText = "Відключення зараз · світло через $dur",
                compactCountdownText = "Світло увімкнуть через $dur",
                nowRatio = nowRatio,
                blocks = blocks
            )
        }

        val next = sorted.firstOrNull { it.startMin > clampedNow }
        if (next != null) {
            val dur = formatDurationUk((next.startMin - clampedNow).toDouble())
            return OutageSummaryUi(
                rangeText = "${next.start} – ${next.end}",
                countdownText = "Наступне відключення через $dur",
                compactCountdownText = "Світло вимкнуть через $dur",
                nowRatio = nowRatio,
                blocks = blocks
            )
        }

        val firstTomorrow = sortedTomorrow.firstOrNull()
        if (firstTomorrow != null) {
            val dur = formatDurationUk((1440 - clampedNow + firstTomorrow.startMin).toDouble())
            return OutageSummaryUi(
                rangeText = "${firstTomorrow.start} – ${firstTomorrow.end}",
                countdownText = "Завтра · через $dur",
                compactCountdownText = "Завтра о ${firstTomorrow.start}",
                nowRatio = nowRatio,
                blocks = blocks
            )
        }

        if (sorted.isNotEmpty()) {
            return OutageSummaryUi(
                rangeText = "Без відключень",
                countdownText = "На сьогодні відключень більше немає",
                compactCountdownText = "На сьогодні відключень немає",
                nowRatio = nowRatio,
                blocks = blocks
            )
        }

        return OutageSummaryUi(
            rangeText = "Немає відключень",
            countdownText = "На сьогодні відключень не заплановано",
            compactCountdownText = "Без відключень сьогодні",
            nowRatio = nowRatio,
            blocks = blocks
        )
    }

    fun configToJson(config: MarstekConfig): String {
        return JSONObject().apply {
            put("ip", config.ip)
            put("port", config.port)
            put("dischargeLimit", config.dischargeLimit)
            put("chargeLimit", config.chargeLimit)
            put("providerId", config.providerId)
            put("group", config.group)
        }.toString()
    }
}
