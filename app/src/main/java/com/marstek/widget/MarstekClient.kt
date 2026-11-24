package com.marstek.widget

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
        val todayJson: String,
        val tomorrowJson: String
    )

    private fun sendUdpCommand(ip: String, port: Int, payload: String, timeoutMs: Int): String {
        var socket: DatagramSocket? = null
        return try {
            val address = InetAddress.getByName(ip)
            socket = DatagramSocket().apply { soTimeout = timeoutMs }
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
        includeOptionalDetails: Boolean = true
    ): UdpQueryOutcome {
        val startedAt = System.currentTimeMillis()
        val cleanIp = ip.trim()
        val cleanPort = if (port in 1..65535) port else 30000

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

        for (attempt in 0..2) {
            try {
                val reply = sendUdpCommand(cleanIp, cleanPort, requestPayload, 3500)
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

                val result = when {
                    root.has("result") -> root.getJSONObject("result")
                    root.has("last_success_payload") ->
                        root.getJSONObject("last_success_payload").optJSONObject("result") ?: root
                    else -> root
                }

                val deviceName = root.optString("src", "").trim()
                var batCap = result.optInt("bat_cap", 0)
                var workMode = ""
                val extraLogs = JSONArray()

                if (includeOptionalDetails) {
                    // Sequential pause prevents Venus D UDP stack from dropping back-to-back packets
                    try {
                        Thread.sleep(120)
                        val batReply = sendUdpCommand(
                            cleanIp,
                            cleanPort,
                            "{\"id\": 2, \"method\": \"Bat.GetStatus\", \"params\": {\"id\": 0}}",
                            1500
                        )
                        extraLogs.put(JSONObject().apply {
                            put("method", "Bat.GetStatus")
                            put("rawResponse", batReply)
                        })
                        val batRes = JSONObject(batReply).optJSONObject("result")
                        if (batCap <= 0 && batRes != null) {
                            batCap = batRes.optInt("rated_capacity", 0)
                        }
                    } catch (_: Exception) {
                    }

                    try {
                        Thread.sleep(120)
                        val modeReply = sendUdpCommand(
                            cleanIp,
                            cleanPort,
                            "{\"id\": 3, \"method\": \"ES.GetMode\", \"params\": {\"id\": 0}}",
                            1500
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
                lastError = "Timeout on attempt ${attempt + 1}: No UDP reply from $cleanIp:$cleanPort"
            } catch (e: Exception) {
                lastError = e.message ?: "UDP error"
                break
            }
        }

        try {
            val probeReply = sendUdpCommand(
                cleanIp,
                cleanPort,
                "{\"id\": 0, \"method\": \"Marstek.GetDevice\", \"params\": {\"ble_mac\": \"0\"}}",
                2500
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

        if (providerId == "prykarpattya-oe") {
            val queues = listOf("1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2", "5.1", "5.2", "6.1", "6.2")
            val selectedGroup = if (queues.contains(requestedGroup)) requestedGroup else queues.first()
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
            val bridgeJson = JSONObject().apply {
                put("providerId", providerId)
                put("providerName", "Прикарпаттяобленерго (Івано-Франківська обл.)")
                put("availableGroups", JSONArray(queues))
                put("selectedGroup", selectedGroup)
                put("status", "ScheduleApplies")
                put("updatedOn", JSONObject.NULL)
                put("dateLabel", todayObj?.optString("eventDate") ?: todayStr)
                put("slots", todaySlots)
                put("tomorrowSlots", tomorrowSlots)
                put("sourceUrl", url)
            }.toString()
            return OutageFetchOutcome(bridgeJson, todaySlots.toString(), tomorrowSlots.toString())
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
            val bridgeJson = JSONObject().apply {
                put("providerId", providerId)
                put("providerName", name)
                put("availableGroups", JSONArray(groups))
                put("selectedGroup", selectedGroup)
                put("status", todayObj?.optString("status") ?: "Unknown")
                put("updatedOn", groupObj?.optString("updatedOn") ?: JSONObject.NULL)
                put("dateLabel", todayObj?.optString("date")?.take(10) ?: kyivNow.toLocalDate().toString())
                put("slots", todaySlots)
                put("tomorrowSlots", tomorrowSlots)
                put("sourceUrl", url)
            }.toString()
            return OutageFetchOutcome(bridgeJson, todaySlots.toString(), tomorrowSlots.toString())
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
        } ?: kyivNow.toLocalDate().toString()

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
        return OutageFetchOutcome(bridgeJson, todaySlots.toString(), tomorrowSlots.toString())
    }
}
