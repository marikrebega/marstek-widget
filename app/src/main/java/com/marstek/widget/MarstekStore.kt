package com.marstek.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

enum class BatteryMode(val labelUk: String, val colorInt: Int) {
    CHARGING("Заряджається", 0xFF3DDC84.toInt()),
    DISCHARGING("Розряджається", 0xFF5AB0FF.toInt()),
    IDLE("Очікування", 0xFF8FA3B8.toInt())
}

data class MarstekConfig(
    val ip: String,
    val port: Int,
    val providerId: String,
    val group: String,
    val notifyOutages: Boolean
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
    val batTemp: Float?,
    val timestamp: Long
)

data class TemperatureVisuals(
    val label: String,
    val colorInt: Int
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
    val primaryValueText: String,
    val compactPrimaryValueText: String,
    val secondaryValueText: String,
    val compactSubText: String,
    val dischargeMinutesLeft: Double?
)

data class OutageBlockRatio(
    val leftRatio: Float,
    val widthRatio: Float
)

data class OutageChipUi(
    val label: String,
    val isHighlight: Boolean
)

data class OutageSummaryUi(
    val rangeText: String,
    val countdownText: String,
    val compactCountdownText: String,
    val shortActionText: String,
    val microTimeText: String,
    val isActiveNow: Boolean,
    val nowRatio: Float,
    val blocks: List<OutageBlockRatio>,
    val todaySlotChips: List<OutageChipUi>,
    val targetOutageMinutes: Double?
)

data class OutageChangeResult(
    val todayChanged: Boolean,
    val tomorrowAppeared: Boolean,
    val tomorrowChanged: Boolean,
    val todaySlots: List<OutageSlotData>,
    val tomorrowSlots: List<OutageSlotData>
)

object MarstekStore {
    private const val PREFS_NAME = "marstek_widget_prefs"

    private const val KEY_IP = "device_ip"
    private const val KEY_PORT = "device_port"
    private const val KEY_PROVIDER_ID = "provider_id"
    private const val KEY_GROUP = "outage_group"
    private const val KEY_NOTIFY_OUTAGES = "notify_outages"

    private const val KEY_LAST_SOC = "last_soc"
    private const val KEY_LAST_CAP = "last_cap"
    private const val KEY_LAST_PV = "last_pv"
    private const val KEY_LAST_GRID = "last_grid"
    private const val KEY_LAST_OFFGRID = "last_offgrid"
    private const val KEY_LAST_DEVICE = "last_device_name"
    private const val KEY_LAST_WORK_MODE = "last_work_mode"
    private const val KEY_LAST_TEMP = "last_bat_temp"
    private const val KEY_LAST_UPDATE = "last_update_time"
    private const val KEY_LAST_ERROR = "last_is_error"

    private const val KEY_OUTAGE_TODAY = "outage_today_json"
    private const val KEY_OUTAGE_TOMORROW = "outage_tomorrow_json"
    private const val KEY_OUTAGE_BASELINE_KEY = "outage_baseline_key"
    private const val KEY_OUTAGE_BASELINE_DATES = "outage_baseline_dates"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun loadConfig(context: Context): MarstekConfig {
        val p = prefs(context)
        val ip = p.getString(KEY_IP, "192.168.0.190")?.trim().orEmpty().ifEmpty { "192.168.0.190" }
        val port = p.getInt(KEY_PORT, 30000).let { if (it in 1..65535) it else 30000 }
        val provider = p.getString(KEY_PROVIDER_ID, "prykarpattya-oe").orEmpty().ifEmpty { "prykarpattya-oe" }
        val group = p.getString(KEY_GROUP, "5.2").orEmpty().ifEmpty { "5.2" }
        val notifyOutages = p.getBoolean(KEY_NOTIFY_OUTAGES, true)
        return MarstekConfig(ip, port, provider, group, notifyOutages)
    }

    fun saveConfig(
        context: Context,
        ip: String,
        port: Int,
        providerId: String,
        group: String,
        notifyOutages: Boolean
    ) {
        prefs(context).edit()
            .putString(KEY_IP, ip.trim().ifEmpty { "192.168.0.190" })
            .putInt(KEY_PORT, if (port in 1..65535) port else 30000)
            .putString(KEY_PROVIDER_ID, providerId.ifEmpty { "prykarpattya-oe" })
            .putString(KEY_GROUP, group.ifEmpty { "5.2" })
            .putBoolean(KEY_NOTIFY_OUTAGES, notifyOutages)
            .apply()
    }

    fun saveStatus(context: Context, status: MarstekStatusData) {
        val timeText = ZonedDateTime.now(ZoneId.of("Europe/Kyiv"))
            .format(DateTimeFormatter.ofPattern("HH:mm"))
        val editor = prefs(context).edit()
            .putInt(KEY_LAST_SOC, status.batSoc)
            .putInt(KEY_LAST_CAP, status.batCap)
            .putInt(KEY_LAST_PV, status.pvPower)
            .putInt(KEY_LAST_GRID, status.onGridPower)
            .putInt(KEY_LAST_OFFGRID, status.offGridPower)
            .putString(KEY_LAST_DEVICE, status.deviceName)
            .putString(KEY_LAST_WORK_MODE, status.workMode)
            .putString(KEY_LAST_UPDATE, timeText)
            .putBoolean(KEY_LAST_ERROR, false)
        if (status.batTemp != null) {
            editor.putFloat(KEY_LAST_TEMP, status.batTemp)
        }
        editor.apply()
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
        val batTemp: Float?,
        val lastUpdateTime: String,
        val isError: Boolean
    )

    fun loadCachedStatus(context: Context): CachedStatus {
        val p = prefs(context)
        val rawTemp = p.getFloat(KEY_LAST_TEMP, Float.NaN)
        return CachedStatus(
            soc = p.getInt(KEY_LAST_SOC, -1),
            batCap = p.getInt(KEY_LAST_CAP, 0),
            pvPower = p.getInt(KEY_LAST_PV, 0),
            onGridPower = p.getInt(KEY_LAST_GRID, 0),
            offGridPower = p.getInt(KEY_LAST_OFFGRID, 0),
            deviceName = p.getString(KEY_LAST_DEVICE, "").orEmpty(),
            workMode = p.getString(KEY_LAST_WORK_MODE, "").orEmpty(),
            batTemp = if (rawTemp.isNaN()) null else rawTemp,
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

    fun getWidgetDay(context: Context, widgetId: Int): String {
        return prefs(context).getString("widget_day_$widgetId", "today") ?: "today"
    }

    fun setWidgetDay(context: Context, widgetId: Int, day: String) {
        prefs(context).edit().putString("widget_day_$widgetId", day).apply()
    }

    fun getWidgetWindowStartHour(context: Context, widgetId: Int): Int {
        return prefs(context).getInt("widget_win_start_$widgetId", -1)
    }

    fun setWidgetWindowStartHour(context: Context, widgetId: Int, startHour: Int) {
        prefs(context).edit().putInt("widget_win_start_$widgetId", startHour).apply()
    }

    fun clearWidgetState(context: Context, widgetId: Int) {
        prefs(context).edit()
            .remove("widget_day_$widgetId")
            .remove("widget_win_start_$widgetId")
            .apply()
    }

    fun evaluateOutageChangesAndSaveBaseline(
        context: Context,
        providerId: String,
        group: String,
        todayDateLabel: String,
        todayJson: String,
        tomorrowDateLabel: String,
        tomorrowJson: String
    ): OutageChangeResult {
        val todaySlots = parseSlotsJson(todayJson)
        val tomorrowSlots = parseSlotsJson(tomorrowJson)
        val todaySig = slotsSignature(todaySlots)
        val tomorrowSig = slotsSignature(tomorrowSlots)

        val p = prefs(context)
        val currentConfigKey = "$providerId|$group"
        val prevConfigKey = p.getString(KEY_OUTAGE_BASELINE_KEY, "")
        val datesJsonStr = if (prevConfigKey == currentConfigKey) {
            p.getString(KEY_OUTAGE_BASELINE_DATES, "{}") ?: "{}"
        } else {
            "{}"
        }

        val datesMap = try {
            JSONObject(datesJsonStr)
        } catch (_: Exception) {
            JSONObject()
        }

        val isFirstBaseline = prevConfigKey != currentConfigKey || datesMap.length() == 0

        var todayChanged = false
        var tomorrowAppeared = false
        var tomorrowChanged = false

        if (!isFirstBaseline) {
            if (todayDateLabel.isNotEmpty() && datesMap.has(todayDateLabel)) {
                val prevTodaySig = datesMap.optString(todayDateLabel, "")
                if (prevTodaySig != todaySig) {
                    todayChanged = true
                }
            }
            if (tomorrowDateLabel.isNotEmpty() && tomorrowSlots.isNotEmpty()) {
                if (!datesMap.has(tomorrowDateLabel)) {
                    tomorrowAppeared = true
                } else {
                    val prevTomorrowSig = datesMap.optString(tomorrowDateLabel, "")
                    if (prevTomorrowSig != tomorrowSig) {
                        tomorrowChanged = true
                    }
                }
            }
        }

        if (todayDateLabel.isNotEmpty()) {
            datesMap.put(todayDateLabel, todaySig)
        }
        if (tomorrowDateLabel.isNotEmpty() && tomorrowSlots.isNotEmpty()) {
            datesMap.put(tomorrowDateLabel, tomorrowSig)
        }

        // Keep map compact (latest 5 dates)
        val keys = mutableListOf<String>()
        val iter = datesMap.keys()
        while (iter.hasNext()) keys.add(iter.next())
        if (keys.size > 5) {
            val toKeep = keys.takeLast(5).toSet()
            for (k in keys) {
                if (!toKeep.contains(k)) datesMap.remove(k)
            }
        }

        p.edit()
            .putString(KEY_OUTAGE_BASELINE_KEY, currentConfigKey)
            .putString(KEY_OUTAGE_BASELINE_DATES, datesMap.toString())
            .apply()

        return OutageChangeResult(
            todayChanged = todayChanged,
            tomorrowAppeared = tomorrowAppeared,
            tomorrowChanged = tomorrowChanged,
            todaySlots = todaySlots,
            tomorrowSlots = tomorrowSlots
        )
    }

    private fun slotsSignature(slots: List<OutageSlotData>): String {
        if (slots.isEmpty()) return "NONE"
        return slots.joinToString(",") { "${it.start}-${it.end}" }
    }

    fun parseSlotsJson(jsonStr: String): List<OutageSlotData> {
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

    fun toDayBlocks(slots: List<OutageSlotData>): List<OutageBlockRatio> {
        return slots.mapNotNull { slot ->
            val s = timeToMinutes(slot.start)
            val e = timeToMinutes(slot.end)
            if (e > s) {
                OutageBlockRatio(leftRatio = s / 1440f, widthRatio = (e - s) / 1440f)
            } else null
        }
    }

    fun computeNetBatteryPower(pvPower: Int, onGridPower: Int, offGridPower: Int): Int {
        return pvPower - onGridPower - offGridPower
    }

    fun getBatteryMode(netBatteryPower: Int): BatteryMode {
        return when {
            netBatteryPower > 25 -> BatteryMode.CHARGING
            netBatteryPower < -25 -> BatteryMode.DISCHARGING
            else -> BatteryMode.IDLE
        }
    }

    fun getTemperatureVisuals(batTemp: Float?): TemperatureVisuals {
        if (batTemp == null || batTemp.isNaN()) {
            return TemperatureVisuals("--°C", 0xFF8FA3B8.toInt())
        }
        val rounded = batTemp.roundToInt()
        return when {
            batTemp < 10f -> TemperatureVisuals("${rounded}°C", 0xFF5AB0FF.toInt())
            batTemp <= 35f -> TemperatureVisuals("${rounded}°C", 0xFF3DDC84.toInt())
            batTemp <= 42f -> TemperatureVisuals("${rounded}°C", 0xFFFFC24D.toInt())
            else -> TemperatureVisuals("${rounded}°C", 0xFFF44336.toInt())
        }
    }

    fun formatAbsPowerUk(netBatteryPower: Int): String {
        val absW = abs(netBatteryPower)
        if (absW <= 25) return "0 Вт"
        return if (absW >= 1000) {
            val kw = "%.1f".format(absW / 1000.0).replace('.', ',')
            "$kw кВт"
        } else {
            "$absW Вт"
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
        if (hours == 0) return "$mins хв"
        return "$hours год ${"%02d".format(mins)} хв"
    }

    fun formatCompactDurationUk(totalMinutes: Double): String {
        val clamped = max(0, totalMinutes.roundToInt())
        val hours = clamped / 60
        val mins = clamped % 60
        if (hours == 0) return "${mins}хв"
        return "${hours}г ${"%02d".format(mins)}хв"
    }

    fun computeEnergyDurations(
        soc: Int,
        batCapWh: Int,
        netBatteryPower: Int
    ): EnergyDurationsUi {
        val mode = getBatteryMode(netBatteryPower)
        val capacityWh = if (batCapWh > 0) batCapWh else 2560
        val clampedSoc = soc.coerceIn(0, 100)
        val availableWh = ((clampedSoc / 100.0) * capacityWh).roundToInt()
        val remainingWh = max(0, capacityWh - availableWh)

        if (mode == BatteryMode.CHARGING) {
            val powerW = max(1, abs(netBatteryPower)).toDouble()
            val toFullPct = max(0, 100 - clampedSoc)
            val minsToFull = ((toFullPct / 100.0) * capacityWh) / powerW * 60.0
            val primaryValue = if (clampedSoc >= 100) "Заряджено" else formatDurationUk(minsToFull)
            val compactPrimary = if (clampedSoc >= 100) "100%" else formatCompactDurationUk(minsToFull)

            return EnergyDurationsUi(
                mode = mode,
                cardTitle = "До повного заряду",
                leftLabel = "До 100%",
                rightLabel = "Залишилось",
                primaryValueText = primaryValue,
                compactPrimaryValueText = compactPrimary,
                secondaryValueText = "$remainingWh Вт·год",
                compactSubText = "до 100% · $remainingWh Вт·год",
                dischargeMinutesLeft = null
            )
        }

        if (mode == BatteryMode.DISCHARGING) {
            val powerW = max(1, abs(netBatteryPower)).toDouble()
            val minsToZero = ((clampedSoc / 100.0) * capacityWh) / powerW * 60.0
            val primaryValue = if (clampedSoc <= 0) "Розряджено" else formatDurationUk(minsToZero)
            val compactPrimary = if (clampedSoc <= 0) "0%" else formatCompactDurationUk(minsToZero)

            return EnergyDurationsUi(
                mode = mode,
                cardTitle = "До розряду",
                leftLabel = "До 0%",
                rightLabel = "Залишок",
                primaryValueText = primaryValue,
                compactPrimaryValueText = compactPrimary,
                secondaryValueText = "$availableWh Вт·год",
                compactSubText = "до 0% · $availableWh Вт·год",
                dischargeMinutesLeft = minsToZero
            )
        }

        return EnergyDurationsUi(
            mode = mode,
            cardTitle = "Стан батареї",
            leftLabel = "Запас енергії",
            rightLabel = "Ємність",
            primaryValueText = "$availableWh Вт·год",
            compactPrimaryValueText = "$availableWh Вт·г",
            secondaryValueText = "$capacityWh Вт·год",
            compactSubText = "ємність $capacityWh Вт·год",
            dischargeMinutesLeft = null
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
        val next = if (current == null) sorted.firstOrNull { it.startMin > clampedNow } else null
        val highlightSlot = current ?: next

        val chips = sorted.map {
            OutageChipUi(
                label = "${it.start}–${it.end}",
                isHighlight = highlightSlot != null &&
                    it.startMin == highlightSlot.startMin &&
                    it.endMin == highlightSlot.endMin
            )
        }

        if (current != null) {
            val remainingMin = (current.endMin - clampedNow).toDouble()
            val dur = formatDurationUk(remainingMin)
            val compactDur = formatCompactDurationUk(remainingMin)
            return OutageSummaryUi(
                rangeText = "${current.start} – ${current.end}",
                countdownText = "Світло о ${current.end} (через $dur)",
                compactCountdownText = "Світло о ${current.end} · $compactDur",
                shortActionText = "о ${current.end} ($compactDur)",
                microTimeText = current.end,
                isActiveNow = true,
                nowRatio = nowRatio,
                blocks = blocks,
                todaySlotChips = chips,
                targetOutageMinutes = remainingMin
            )
        }

        if (next != null) {
            val untilMin = (next.startMin - clampedNow).toDouble()
            val dur = formatDurationUk(untilMin)
            val compactDur = formatCompactDurationUk(untilMin)
            return OutageSummaryUi(
                rangeText = "${next.start} – ${next.end}",
                countdownText = "Вимкнення о ${next.start} (через $dur)",
                compactCountdownText = "Вимкн. о ${next.start} · $compactDur",
                shortActionText = "о ${next.start} ($compactDur)",
                microTimeText = next.start,
                isActiveNow = false,
                nowRatio = nowRatio,
                blocks = blocks,
                todaySlotChips = chips,
                targetOutageMinutes = (next.endMin - next.startMin).toDouble()
            )
        }

        val firstTomorrow = sortedTomorrow.firstOrNull()
        if (firstTomorrow != null) {
            val untilTomorrow = (1440 - clampedNow + firstTomorrow.startMin).toDouble()
            val dur = formatDurationUk(untilTomorrow)
            val compactDur = formatCompactDurationUk(untilTomorrow)
            return OutageSummaryUi(
                rangeText = "${firstTomorrow.start} – ${firstTomorrow.end}",
                countdownText = "Завтра о ${firstTomorrow.start} (через $dur)",
                compactCountdownText = "Завтра о ${firstTomorrow.start} · $compactDur",
                shortActionText = "завтра ${firstTomorrow.start}",
                microTimeText = firstTomorrow.start,
                isActiveNow = false,
                nowRatio = nowRatio,
                blocks = blocks,
                todaySlotChips = chips,
                targetOutageMinutes = (firstTomorrow.endMin - firstTomorrow.startMin).toDouble()
            )
        }

        if (sorted.isNotEmpty()) {
            return OutageSummaryUi(
                rangeText = "Без відключень",
                countdownText = "На сьогодні відключень більше немає",
                compactCountdownText = "Світло до кінця доби",
                shortActionText = "до кінця доби",
                microTimeText = "Світло",
                isActiveNow = false,
                nowRatio = nowRatio,
                blocks = blocks,
                todaySlotChips = chips,
                targetOutageMinutes = null
            )
        }

        return OutageSummaryUi(
            rangeText = "Немає відключень",
            countdownText = "На сьогодні відключень не заплановано",
            compactCountdownText = "Без відключень сьогодні",
            shortActionText = "світло є",
            microTimeText = "Без в.",
            isActiveNow = false,
            nowRatio = nowRatio,
            blocks = blocks,
            todaySlotChips = chips,
            targetOutageMinutes = null
        )
    }

    fun configToJson(config: MarstekConfig): String {
        return JSONObject().apply {
            put("ip", config.ip)
            put("port", config.port)
            put("providerId", config.providerId)
            put("group", config.group)
            put("notifyOutages", config.notifyOutages)
        }.toString()
    }
}
