package com.marstek.widget

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import org.json.JSONArray
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URL
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

object MarstekClient {

    data class UdpQueryOutcome(
        val bridgeJson: String,
        val status: MarstekStatusData?
    )

    data class OutageFetchOutcome(
        val bridgeJson: String,
        val todayDateLabel: String,
        val tomorrowDateLabel: String,
        val todayJson: String,
        val tomorrowJson: String
    )

    private fun extractResultObject(root: JSONObject): JSONObject {
        root.optJSONObject("result")?.let { return it }
        root.optJSONArray("result")?.optJSONObject(0)?.let { return it }
        root.optJSONObject("last_success_payload")?.optJSONObject("result")?.let { return it }
        return root
    }

    private fun parseTempC(obj: JSONObject?, vararg keys: String): Float? {
        if (obj == null) return null
        val candidates = keys.toMutableList()
        val iter = obj.keys()
        while (iter.hasNext()) {
            val k = iter.next()
            if (k.contains("temp", ignoreCase = true) && !candidates.contains(k)) {
                candidates.add(k)
            }
        }
        for (key in candidates) {
            if (!obj.has(key) || obj.isNull(key)) continue
            val raw = obj.opt(key)
            val parsed = when (raw) {
                is Number -> raw.toFloat()
                is String -> raw.trim()
                    .replace("°C", "", ignoreCase = true)
                    .replace("℃", "")
                    .replace(",", ".")
                    .trim()
                    .toFloatOrNull()
                else -> null
            }
            if (parsed != null && !parsed.isNaN() && !parsed.isInfinite()) {
                val normalized = if (parsed > 120f) parsed / 10f else parsed
                return kotlin.math.round(normalized * 10f) / 10f
            }
        }
        return null
    }

    @Suppress("DEPRECATION")
    fun isWifiConnected(context: Context?): Boolean {
        return findWifiNetwork(context) != null
    }

    @Suppress("DEPRECATION")
    private fun findWifiNetwork(context: Context?): Network? {
        if (context == null) return null
        return try {
            val cm = context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return null
            val active = cm.activeNetwork
            val activeCaps = active?.let { cm.getNetworkCapabilities(it) }
            if (active != null && activeCaps != null &&
                activeCaps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
                !activeCaps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
            ) {
                return active
            }
            for (net in cm.allNetworks) {
                val caps = cm.getNetworkCapabilities(net) ?: continue
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
                    !caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
                ) {
                    return net
                }
            }
            null
        } catch (_: Exception) {
            null
        }
    }

    private fun sendUdpCommand(
        ip: String,
        port: Int,
        payload: String,
        timeoutMs: Int,
        wifiNetwork: Network? = null
    ): String {
        var socket: DatagramSocket? = null
        return try {
            val address = InetAddress.getByName(ip)
            socket = DatagramSocket().apply { soTimeout = timeoutMs }
            if (wifiNetwork != null) {
                wifiNetwork.bindSocket(socket)
            }
            val sendData = payload.toByteArray(Charsets.UTF_8)
            socket.send(DatagramPacket(sendData, sendData.size, address, port))

            val buffer = ByteArray(4096)
            val recvPacket = DatagramPacket(buffer, buffer.size)
            socket.receive(recvPacket)
            String(recvPacket.data, 0, recvPacket.length, Charsets.UTF_8).trim()
        } finally {
            socket?.close()
        }
    }

    fun queryMarstekStatus(
        ip: String,
        port: Int,
        includeOptionalDetails: Boolean = true,
        context: Context? = null,
        quickMode: Boolean = false
    ): UdpQueryOutcome {
        val startedAt = System.currentTimeMillis()
        val cleanIp = ip.trim()
        val cleanPort = if (port in 1..65535) port else 30000
        val wifiNetwork = findWifiNetwork(context)

        if (cleanIp.isEmpty()) {
            val errJson = JSONObject().apply {
                put("error", "IP address cannot be empty")
                put("method", "ES.GetStatus")
                put("durationMs", 0)
            }.toString()
            return UdpQueryOutcome(errJson, null)
        }

        val requestPayload = "{\"id\": 1, \"method\": \"ES.GetStatus\", \"params\": {\"id\": 0}}"
        var lastError: String? = null
        var rawReply: String? = null
        val maxAttempts = if (quickMode) 2 else 3
        val socketTimeoutMs = if (quickMode) 2400 else 3500
        var activeWifiForSession: Network? = wifiNetwork

        for (attempt in 0 until maxAttempts) {
            val useWifiNet = if (attempt == 0) wifiNetwork else null
            try {
                val reply = sendUdpCommand(cleanIp, cleanPort, requestPayload, socketTimeoutMs, useWifiNet)
                activeWifiForSession = useWifiNet
                rawReply = reply
                val root = JSONObject(reply)
                if (root.has("error") && !root.isNull("error")) {
                    val errObj = root.optJSONObject("error")
                    val errMsg = errObj?.optString("message") ?: root.optString("error")
                    val errJson = JSONObject().apply {
                        put("error", "Marstek API error: $errMsg")
                        put("rawResponse", reply)
                        put("method", "ES.GetStatus")
                        put("durationMs", System.currentTimeMillis() - startedAt)
                    }.toString()
                    return UdpQueryOutcome(errJson, null)
                }

                val result = extractResultObject(root)

                val deviceName = root.optString("src", "").trim()
                var batCap = result.optInt("bat_cap", 0)
                var batTemp = parseTempC(result, "bat_temp", "temp", "temperature", "cell_temp", "bms_temp", "bat_t", "mos_temp", "env_temp")
                var workMode = ""
                val extraLogs = JSONArray()

                if (includeOptionalDetails) {
                    val batAttempts = if (quickMode) 1 else 2
                    val batTimeoutMs = if (quickMode) 1600 else 2200
                    var batLastError: String? = null
                    var batSucceeded = false

                    for (batAttempt in 0 until batAttempts) {
                        try {
                            Thread.sleep(250)
                            val batReply = sendUdpCommand(
                                cleanIp,
                                cleanPort,
                                "{\"id\": 2, \"method\": \"Bat.GetStatus\", \"params\": {\"id\": 0}}",
                                batTimeoutMs,
                                activeWifiForSession
                            )
                            extraLogs.put(JSONObject().apply {
                                put("method", "Bat.GetStatus")
                                put("rawResponse", batReply)
                            })
                            val batRoot = JSONObject(batReply)
                            if (!batRoot.has("error") || batRoot.isNull("error")) {
                                val batRes = extractResultObject(batRoot)
                                if (batCap <= 0) {
                                    batCap = batRes.optInt("rated_capacity", 0)
                                }
                                if (batTemp == null) {
                                    batTemp = parseTempC(batRes, "bat_temp", "temp", "temperature", "cell_temp", "bms_temp", "bat_t", "mos_temp", "env_temp")
                                }
                                batSucceeded = true
                                break
                            } else {
                                batLastError = batReply
                                break
                            }
                        } catch (e: Exception) {
                            batLastError = e.message ?: "Bat.GetStatus timeout"
                        }
                    }

                    if (!batSucceeded && batLastError != null && !batLastError.trim().startsWith("{")) {
                        extraLogs.put(JSONObject().apply {
                            put("method", "Bat.GetStatus")
                            put("rawResponse", "ERROR: $batLastError")
                        })
                    }

                    if (!quickMode) {
                        try {
                            Thread.sleep(120)
                            val modeReply = sendUdpCommand(
                                cleanIp,
                                cleanPort,
                                "{\"id\": 3, \"method\": \"ES.GetMode\", \"params\": {\"id\": 0}}",
                                1400,
                                wifiNetwork
                            )
                            extraLogs.put(JSONObject().apply {
                                put("method", "ES.GetMode")
                                put("rawResponse", modeReply)
                            })
                            val modeRes = JSONObject(modeReply).optJSONObject("result")
                            if (modeRes != null) {
                                workMode = modeRes.optString("mode", "").trim()
                            }
                        } catch (_: Exception) {
                        }
                    }
                }

                val now = System.currentTimeMillis()
                val statusData = MarstekStatusData(
                    batSoc = result.optInt("bat_soc", 0),
                    batCap = batCap,
                    pvPower = result.optInt("pv_power", 0),
                    onGridPower = result.optInt("ongrid_power", 0),
                    offGridPower = result.optInt("offgrid_power", 0),
                    totalPvEnergy = result.optLong("total_pv_energy", 0L),
                    totalGridOutputEnergy = result.optLong("total_grid_output_energy", 0L),
                    totalGridInputEnergy = result.optLong("total_grid_input_energy", 0L),
                    totalLoadEnergy = result.optLong("total_load_energy", 0L),
                    deviceName = deviceName,
                    workMode = workMode,
                    batTemp = batTemp,
                    timestamp = now
                )

                val statusDto = JSONObject().apply {
                    put("batSoc", statusData.batSoc)
                    put("batCap", statusData.batCap)
                    put("pvPower", statusData.pvPower)
                    put("onGridPower", statusData.onGridPower)
                    put("offGridPower", statusData.offGridPower)
                    put("totalPvEnergy", statusData.totalPvEnergy)
                    put("totalGridOutputEnergy", statusData.totalGridOutputEnergy)
                    put("totalGridInputEnergy", statusData.totalGridInputEnergy)
                    put("totalLoadEnergy", statusData.totalLoadEnergy)
                    if (deviceName.isNotEmpty()) put("deviceName", deviceName)
                    if (workMode.isNotEmpty()) put("workMode", workMode)
                    if (batTemp != null) put("batTemp", batTemp.toDouble())
                    put("timestamp", now)
                }

                val bridgeJson = JSONObject().apply {
                    put("status", statusDto)
                    put("rawResponse", reply)
                    put("method", "ES.GetStatus")
                    put("durationMs", System.currentTimeMillis() - startedAt)
                    put("extraLogs", extraLogs)
                }.toString()

                return UdpQueryOutcome(bridgeJson, statusData)
            } catch (_: SocketTimeoutException) {
                lastError = "Timeout on attempt ${attempt + 1} (wifi=${useWifiNet != null}): No UDP reply from $cleanIp:$cleanPort"
            } catch (e: Exception) {
                lastError = "Attempt ${attempt + 1} (wifi=${useWifiNet != null}): ${e.javaClass.simpleName}: ${e.message ?: "UDP error"}"
                if (useWifiNet == null) break
            }
        }

        if (!quickMode) {
            try {
                val probeReply = sendUdpCommand(
                    cleanIp,
                    cleanPort,
                    "{\"id\": 0, \"method\": \"Marstek.GetDevice\", \"params\": {\"ble_mac\": \"0\"}}",
                    2500,
                    wifiNetwork
                )
                val errJson = JSONObject().apply {
                    put("error", "Device responded to Marstek.GetDevice ($probeReply), but ES.GetStatus timed out.")
                    put("rawResponse", probeReply)
                    put("method", "Marstek.GetDevice")
                    put("durationMs", System.currentTimeMillis() - startedAt)
                }.toString()
                return UdpQueryOutcome(errJson, null)
            } catch (_: Exception) {
            }
        }

        val errJson = JSONObject().apply {
            put("error", lastError ?: "Poll timed out after multiple attempts")
            if (rawReply != null) put("rawResponse", rawReply)
            put("method", "ES.GetStatus")
            put("durationMs", System.currentTimeMillis() - startedAt)
        }.toString()
        return UdpQueryOutcome(errJson, null)
    }

    private fun httpGet(urlStr: String, extraHeaders: Map<String, String> = emptyMap()): String {
        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8000
            readTimeout = 8000
            setRequestProperty("User-Agent", "MarstekVenusWidget/1.0")
            setRequestProperty("Accept", "application/json")
            extraHeaders.forEach { (k, v) -> setRequestProperty(k, v) }
        }
        try {
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            if (code !in 200..299) {
                throw IllegalStateException("HTTP $code from $urlStr")
            }
            return body
        } finally {
            conn.disconnect()
        }
    }

    private fun hhmmToMin(hhmm: String, isEnd: Boolean): Int {
        val parts = hhmm.split(":")
        val h = parts.getOrNull(0)?.toIntOrNull() ?: 0
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val total = h * 60 + m
        if (isEnd && total == 0) return 1440
        return total.coerceIn(0, 1440)
    }

    private fun minToHhmm(totalMin: Int): String {
        val clamped = totalMin.coerceIn(0, 1440)
        return "%02d:%02d".format(clamped / 60, clamped % 60)
    }

    private fun mergeIntervals(intervals: List<Pair<Int, Int>>): JSONArray {
        val sorted = intervals.filter { it.second > it.first }.sortedBy { it.first }
        val merged = mutableListOf<Pair<Int, Int>>()
        for ((s, e) in sorted) {
            if (merged.isNotEmpty() && s <= merged.last().second) {
                val prev = merged.removeAt(merged.lastIndex)
                merged.add(prev.first to maxOf(prev.second, e))
            } else {
                merged.add(s to e)
            }
        }
        return JSONArray().apply {
            merged.forEachIndexed { idx, (s, e) ->
                put(JSONObject().apply {
                    put("id", "api-slot-$idx-$s")
                    put("start", minToHhmm(s))
                    put("end", minToHhmm(e))
                })
            }
        }
    }

    fun fetchOutages(providerId: String, requestedGroup: String): OutageFetchOutcome {
        val kyivZone = ZoneId.of("Europe/Kyiv")
        val kyivNow = ZonedDateTime.now(kyivZone)
        val defaultTodayDate = kyivNow.toLocalDate().toString()
        val defaultTomorrowDate = kyivNow.plusDays(1).toLocalDate().toString()

        if (providerId == "prykarpattya-oe") {
            val queues = listOf("1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2", "5.1", "5.2", "6.1", "6.2")
            val selectedGroup = if (queues.contains(requestedGroup)) requestedGroup else "5.2"
            val url = "https://be-svitlo.oe.if.ua/schedule-by-queue?queue=$selectedGroup"
            val raw = httpGet(
                url,
                mapOf(
                    "Origin" to "https://svitlo.oe.if.ua",
                    "Referer" to "https://svitlo.oe.if.ua/"
                )
            )
            val days = JSONArray(raw)
            val todayStr = kyivNow.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))
            val tomorrowStr = kyivNow.plusDays(1).format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))
            var todayIdx = 0
            for (i in 0 until days.length()) {
                if (days.getJSONObject(i).optString("eventDate") == todayStr) {
                    todayIdx = i
                    break
                }
            }
            val todayObj = if (days.length() > todayIdx) days.getJSONObject(todayIdx) else null
            val tomorrowObj = if (days.length() > todayIdx + 1) days.getJSONObject(todayIdx + 1) else null

            fun parseDay(dayObj: JSONObject?): JSONArray {
                val arr = dayObj?.optJSONObject("queues")?.optJSONArray(selectedGroup) ?: return JSONArray()
                val intervals = mutableListOf<Pair<Int, Int>>()
                for (i in 0 until arr.length()) {
                    val item = arr.getJSONObject(i)
                    val from = item.optString("from")
                    val to = item.optString("to")
                    if (from.isNotEmpty() && to.isNotEmpty()) {
                        intervals.add(hhmmToMin(from, false) to hhmmToMin(to, true))
                    }
                }
                return mergeIntervals(intervals)
            }

            val todaySlots = parseDay(todayObj)
            val tomorrowSlots = parseDay(tomorrowObj)
            val todayLabel = todayObj?.optString("eventDate")?.takeIf { it.isNotEmpty() } ?: todayStr
            val tomorrowLabel = tomorrowObj?.optString("eventDate")?.takeIf { it.isNotEmpty() } ?: tomorrowStr
            val bridgeJson = JSONObject().apply {
                put("providerId", providerId)
                put("providerName", "Прикарпаттяобленерго (Івано-Франківська обл.)")
                put("availableGroups", JSONArray(queues))
                put("selectedGroup", selectedGroup)
                put("status", "ScheduleApplies")
                put("updatedOn", JSONObject.NULL)
                put("dateLabel", todayLabel)
                put("slots", todaySlots)
                put("tomorrowSlots", tomorrowSlots)
                put("sourceUrl", url)
            }.toString()
            return OutageFetchOutcome(
                bridgeJson = bridgeJson,
                todayDateLabel = todayLabel,
                tomorrowDateLabel = tomorrowLabel,
                todayJson = todaySlots.toString(),
                tomorrowJson = tomorrowSlots.toString()
            )
        }

        if (providerId.startsWith("yasno-")) {
            val (name, url) = when (providerId) {
                "yasno-dnipro-dnem" -> "Дніпро (ДнЕМ · Yasno)" to "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/301/planned-outages"
                "yasno-dnipro-cek" -> "Дніпро (ЦЕК · Yasno)" to "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/303/planned-outages"
                else -> "Київ (ДТЕК КЕМ · Yasno)" to "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/25/dsos/902/planned-outages"
            }
            val root = JSONObject(httpGet(url))
            val groups = mutableListOf<String>()
            val iter = root.keys()
            while (iter.hasNext()) groups.add(iter.next())
            groups.sortBy { it.toDoubleOrNull() ?: 999.0 }
            val selectedGroup = if (groups.contains(requestedGroup)) requestedGroup else (groups.firstOrNull() ?: "1.1")
            val groupObj = root.optJSONObject(selectedGroup)

            fun parseYasnoDay(dayObj: JSONObject?): JSONArray {
                val arr = dayObj?.optJSONArray("slots") ?: return JSONArray()
                val intervals = mutableListOf<Pair<Int, Int>>()
                for (i in 0 until arr.length()) {
                    val slot = arr.getJSONObject(i)
                    if (slot.optString("type") == "Definite") {
                        intervals.add(slot.optInt("start", 0) to slot.optInt("end", 0))
                    }
                }
                return mergeIntervals(intervals)
            }

            val todayObj = groupObj?.optJSONObject("today")
            val tomorrowObj = groupObj?.optJSONObject("tomorrow")
            val todaySlots = parseYasnoDay(todayObj)
            val tomorrowSlots = parseYasnoDay(tomorrowObj)
            val todayLabel = todayObj?.optString("date")?.take(10)?.takeIf { it.isNotEmpty() } ?: defaultTodayDate
            val tomorrowLabel = tomorrowObj?.optString("date")?.take(10)?.takeIf { it.isNotEmpty() } ?: defaultTomorrowDate
            val bridgeJson = JSONObject().apply {
                put("providerId", providerId)
                put("providerName", name)
                put("availableGroups", JSONArray(groups))
                put("selectedGroup", selectedGroup)
                put("status", todayObj?.optString("status") ?: "Unknown")
                put("updatedOn", groupObj?.optString("updatedOn") ?: JSONObject.NULL)
                put("dateLabel", todayLabel)
                put("slots", todaySlots)
                put("tomorrowSlots", tomorrowSlots)
                put("sourceUrl", url)
            }.toString()
            return OutageFetchOutcome(
                bridgeJson = bridgeJson,
                todayDateLabel = todayLabel,
                tomorrowDateLabel = tomorrowLabel,
                todayJson = todaySlots.toString(),
                tomorrowJson = tomorrowSlots.toString()
            )
        }

        val (name, url) = if (providerId == "dtek-odesa") {
            "Одеська обл. (ДТЕК ОЕМ)" to "https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/data/odesa.json"
        } else {
            "Київська обл. (ДТЕК КРЕМ)" to "https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/data/kyiv-region.json"
        }
        val doc = JSONObject(httpGet(url))
        val fact = doc.optJSONObject("fact") ?: JSONObject()
        val dataObj = fact.optJSONObject("data") ?: JSONObject()
        val keys = mutableListOf<String>()
        val kIter = dataObj.keys()
        while (kIter.hasNext()) keys.add(kIter.next())
        keys.sort()

        val todayEpoch = fact.optLong("today", 0L).toString()
        val todayKey = if (dataObj.has(todayEpoch)) todayEpoch else (keys.firstOrNull() ?: "")
        val todayMap = if (todayKey.isNotEmpty()) dataObj.optJSONObject(todayKey) ?: JSONObject() else JSONObject()
        val tomorrowKey = keys.firstOrNull { (it.toLongOrNull() ?: 0L) > (todayKey.toLongOrNull() ?: 0L) }
        val tomorrowMap = if (tomorrowKey != null) dataObj.optJSONObject(tomorrowKey) else null

        val groups = mutableListOf<String>()
        val gIter = todayMap.keys()
        while (gIter.hasNext()) groups.add(gIter.next())
        groups.sort()
        val selectedGroup = if (groups.contains(requestedGroup)) requestedGroup else (groups.firstOrNull() ?: "GPV1.1")

        fun parseHourly(hourly: JSONObject?): JSONArray {
            if (hourly == null) return JSONArray()
            val intervals = mutableListOf<Pair<Int, Int>>()
            for (h in 1..24) {
                val state = hourly.optString(h.toString())
                val base = (h - 1) * 60
                when (state) {
                    "no" -> intervals.add(base to base + 60)
                    "first" -> intervals.add(base to base + 30)
                    "second" -> intervals.add(base + 30 to base + 60)
                }
            }
            return mergeIntervals(intervals)
        }

        val dateLabel = todayKey.toLongOrNull()?.let {
            Instant.ofEpochSecond(it).atZone(kyivZone).toLocalDate().toString()
        } ?: defaultTodayDate
        val tomorrowLabel = tomorrowKey?.toLongOrNull()?.let {
            Instant.ofEpochSecond(it).atZone(kyivZone).toLocalDate().toString()
        } ?: defaultTomorrowDate

        val todaySlots = parseHourly(todayMap.optJSONObject(selectedGroup))
        val tomorrowSlots = parseHourly(tomorrowMap?.optJSONObject(selectedGroup))
        val bridgeJson = JSONObject().apply {
            put("providerId", providerId)
            put("providerName", name)
            put("availableGroups", JSONArray(groups))
            put("selectedGroup", selectedGroup)
            put("status", "ScheduleApplies")
            put("updatedOn", doc.optString("lastUpdated", ""))
            put("dateLabel", dateLabel)
            put("slots", todaySlots)
            put("tomorrowSlots", tomorrowSlots)
            put("sourceUrl", url)
        }.toString()
        return OutageFetchOutcome(
            bridgeJson = bridgeJson,
            todayDateLabel = dateLabel,
            tomorrowDateLabel = tomorrowLabel,
            todayJson = todaySlots.toString(),
            tomorrowJson = tomorrowSlots.toString()
        )
    }
}
