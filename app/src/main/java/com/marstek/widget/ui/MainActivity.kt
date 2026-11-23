package com.marstek.widget.ui

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.marstek.widget.R
import com.marstek.widget.data.PreferencesManager
import com.marstek.widget.databinding.ActivityMainBinding
import com.marstek.widget.network.MarstekUdpClient
import com.marstek.widget.receiver.MarstekWidgetProvider
import com.marstek.widget.worker.WidgetUpdateWorker
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: PreferencesManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = PreferencesManager(this)

        // Prepopulate saved values
        val currentIp = if (prefs.deviceIp.isNotBlank()) prefs.deviceIp else "192.168.0.190"
        binding.etDeviceIp.setText(currentIp)
        binding.etDevicePort.setText(prefs.devicePort.toString())

        binding.btnTestConnection.setOnClickListener {
            testConnection()
        }

        binding.btnSaveSettings.setOnClickListener {
            saveSettings()
        }
    }

    private fun testConnection() {
        val ip = binding.etDeviceIp.text?.toString()?.trim() ?: ""
        val portStr = binding.etDevicePort.text?.toString()?.trim() ?: "30000"
        val port = portStr.toIntOrNull() ?: 30000

        if (ip.isBlank()) {
            binding.etDeviceIp.error = "Please enter your Marstek device IP"
            return
        }

        binding.cardTestResult.visibility = View.VISIBLE
        binding.tvTestStatusTitle.text = "Testing UDP Connection..."
        binding.tvTestResultDetails.text = "Sending ES.GetStatus to $ip:$port over Wi-Fi..."

        lifecycleScope.launch {
            val result = MarstekUdpClient.getStatus(ip, port)
            if (result.isSuccess) {
                val status = result.getOrNull()!!
                binding.tvTestStatusTitle.text = "✓ Connection Successful"
                binding.tvTestStatusTitle.setTextColor(getColor(R.color.accent))
                binding.tvTestResultDetails.text = """
                    Battery SOC:      ${status.batSoc}%
                    Battery Capacity: ${status.batCap} Wh
                    Solar PV Power:   ${status.pvPower} W
                    Grid Power:       ${status.onGridPower} W
                    Off-grid Power:   ${status.offGridPower} W
                    Total PV Energy:  ${status.totalPvEnergy} Wh
                    Total Grid In:    ${status.totalGridInputEnergy} Wh
                    Total Grid Out:   ${status.totalGridOutputEnergy} Wh
                """.trimIndent()
            } else {
                val exception = result.exceptionOrNull()
                binding.tvTestStatusTitle.text = "✗ Connection Failed"
                binding.tvTestStatusTitle.setTextColor(getColor(R.color.battery_low))
                binding.tvTestResultDetails.text = """
                    Error: ${exception?.localizedMessage ?: "Timeout or unreachable"}
                    
                    Checks:
                    1. Is your Samsung phone on the same Wi-Fi as the Marstek?
                    2. Did you enable "Local API / Open API" in the Marstek app?
                    3. Check if the IP address matches your router DHCP assignment.
                """.trimIndent()
            }
        }
    }

    private fun saveSettings() {
        val ip = binding.etDeviceIp.text?.toString()?.trim() ?: ""
        val portStr = binding.etDevicePort.text?.toString()?.trim() ?: "30000"
        val port = portStr.toIntOrNull() ?: 30000

        if (ip.isBlank()) {
            binding.etDeviceIp.error = "Please enter IP"
            return
        }

        prefs.deviceIp = ip
        prefs.devicePort = port

        // Schedule periodic background worker (30 min interval)
        WidgetUpdateWorker.schedule(this, 30)

        // Trigger immediate widget update
        MarstekWidgetProvider.updateAllWidgets(this)

        Toast.makeText(this, "Settings saved! Updating widget...", Toast.LENGTH_SHORT).show()
    }
}
