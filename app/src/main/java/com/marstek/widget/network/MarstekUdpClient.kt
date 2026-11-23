package com.marstek.widget.network

import com.marstek.widget.model.MarstekStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

object MarstekUdpClient {

    private const val SOCKET_TIMEOUT_MS = 3500
    private const val BUFFER_SIZE = 4096

    /**
     * Sends ES.GetStatus JSON-RPC request to Marstek Venus D over UDP and parses the response.
     */
    suspend fun getStatus(ipAddress: String, port: Int = 30000): Result<MarstekStatus> =
        withContext(Dispatchers.IO) {
            var socket: DatagramSocket? = null
            try {
                if (ipAddress.isBlank()) {
                    return@withContext Result.failure(IllegalArgumentException("IP address cannot be empty"))
                }

                val address = InetAddress.getByName(ipAddress)
                socket = DatagramSocket()
                socket.soTimeout = SOCKET_TIMEOUT_MS

                // Standard Marstek JSON-RPC query
                val requestPayload = "{\"id\": 1, \"method\": \"ES.GetStatus\", \"params\": {\"id\": 0}}"
                val sendData = requestPayload.toByteArray(Charsets.UTF_8)
                val sendPacket = DatagramPacket(sendData, sendData.size, address, port)

                socket.send(sendPacket)

                // Buffer to receive response
                val receiveBuffer = ByteArray(BUFFER_SIZE)
                val receivePacket = DatagramPacket(receiveBuffer, receiveBuffer.size)

                socket.receive(receivePacket)

                val responseJson = String(receivePacket.data, 0, receivePacket.length, Charsets.UTF_8).trim()
                val status = MarstekStatus.fromJson(responseJson)

                Result.success(status)
            } catch (e: Exception) {
                Result.failure(e)
            } finally {
                socket?.close()
            }
        }
}
