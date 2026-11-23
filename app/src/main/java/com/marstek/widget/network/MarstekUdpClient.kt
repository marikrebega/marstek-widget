package com.marstek.widget.network

import com.marstek.widget.model.MarstekStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException

object MarstekUdpClient {

    private const val SOCKET_TIMEOUT_MS = 4000
    private const val BUFFER_SIZE = 4096
    private const val MAX_RETRIES = 2

    /**
     * Sends ES.GetStatus JSON-RPC request to Marstek Venus D over UDP and parses the response.
     * Tries Marstek.GetDevice discovery probe first if needed.
     */
    suspend fun getStatus(ipAddress: String, port: Int = 30000): Result<MarstekStatus> =
        withContext(Dispatchers.IO) {
            if (ipAddress.isBlank()) {
                return@withContext Result.failure(IllegalArgumentException("IP address cannot be empty"))
            }

            var lastError: Exception? = null

            // Try ES.GetStatus with retries
            for (attempt in 0..MAX_RETRIES) {
                var socket: DatagramSocket? = null
                try {
                    val address = InetAddress.getByName(ipAddress)
                    socket = DatagramSocket()
                    socket.soTimeout = SOCKET_TIMEOUT_MS

                    // Standard Marstek JSON-RPC query
                    val requestPayload = "{\"id\": 1, \"method\": \"ES.GetStatus\", \"params\": {\"id\": 0}}"
                    val sendData = requestPayload.toByteArray(Charsets.UTF_8)
                    val sendPacket = DatagramPacket(sendData, sendData.size, address, port)

                    socket.send(sendPacket)

                    val receiveBuffer = ByteArray(BUFFER_SIZE)
                    val receivePacket = DatagramPacket(receiveBuffer, receiveBuffer.size)

                    socket.receive(receivePacket)

                    val responseJson = String(receivePacket.data, 0, receivePacket.length, Charsets.UTF_8).trim()
                    
                    // Verify response is valid JSON
                    val root = JSONObject(responseJson)
                    if (root.has("error") && !root.isNull("error")) {
                        val errObj = root.optJSONObject("error")
                        val errMsg = errObj?.optString("message") ?: root.getString("error")
                        return@withContext Result.failure(Exception("Marstek API error: $errMsg"))
                    }

                    val status = MarstekStatus.fromJson(responseJson)
                    return@withContext Result.success(status)

                } catch (e: SocketTimeoutException) {
                    lastError = Exception("Timeout on attempt ${attempt + 1}: No UDP reply from $ipAddress:$port")
                } catch (e: Exception) {
                    lastError = e
                } finally {
                    socket?.close()
                }
            }

            // Fallback probe: try Marstek.GetDevice to check if basic API is active
            try {
                val probeResult = probeDevice(ipAddress, port)
                if (probeResult != null) {
                    return@withContext Result.failure(
                        Exception("Device responded to Marstek.GetDevice ($probeResult), but ES.GetStatus timed out. Battery may need firmware restart.")
                    )
                }
            } catch (_: Exception) {}

            Result.failure(lastError ?: SocketTimeoutException("Poll timed out after multiple attempts"))
        }

    /**
     * Probes device using discovery command from MarstekDeviceOpenApi.pdf
     */
    suspend fun probeDevice(ipAddress: String, port: Int = 30000): String? =
        withContext(Dispatchers.IO) {
            var socket: DatagramSocket? = null
            try {
                val address = InetAddress.getByName(ipAddress)
                socket = DatagramSocket()
                socket.soTimeout = 3000

                val payload = "{\"id\": 0, \"method\": \"Marstek.GetDevice\", \"params\": {\"ble_mac\": \"0\"}}"
                val sendData = payload.toByteArray(Charsets.UTF_8)
                val packet = DatagramPacket(sendData, sendData.size, address, port)
                socket.send(packet)

                val buffer = ByteArray(BUFFER_SIZE)
                val recvPacket = DatagramPacket(buffer, buffer.size)
                socket.receive(recvPacket)
                String(recvPacket.data, 0, recvPacket.length, Charsets.UTF_8).trim()
            } catch (e: Exception) {
                null
            } finally {
                socket?.close()
            }
        }
}
