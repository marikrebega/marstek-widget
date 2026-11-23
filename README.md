# Marstek Venus D - Samsung One UI Android Widget

A standalone Android home screen widget for **Marstek Venus D** energy storage systems. It talks **directly to your battery via the local Wi-Fi network using Marstek's UDP Local Open API** (port `30000`). No Home Assistant, Raspberry Pi, cloud account, or external server is required.

---

## Key Features

* **Direct Local UDP Protocol:** Queries the battery directly using the JSON-RPC command `ES.GetStatus`.
* **Samsung One UI Aesthetic:** Frosted dark card layout, rounded pill containers, color-coded battery health (Green / Orange / Red), Solar PV Wattage, and Grid status (Charging / Discharging / Idle).
* **Instant Manual Refresh:** Tap the refresh icon (↻) in the widget corner to immediately poll live data.
* **Auto Periodic Updates:** Uses Android `WorkManager` to silently update stats every 15 minutes when connected to your home Wi-Fi network.
* **Built-in Connection Tester:** The companion app lets you test the UDP connection to your battery's IP before placing the widget, displaying full telemetry (SOC, Capacity, PV Watts, Grid Watts, Total PV, Total Grid In/Out).

---

## Requirements

1. **Marstek Venus D** connected to the same Wi-Fi network as your Samsung phone.
2. In the official **Marstek App**:
   * Navigate to your Venus D device settings.
   * Enable **Local Open API / Local API** (Default port: `30000`).
   * Note the local IP address assigned by your Wi-Fi router (e.g. `192.168.1.150`). *(Tip: Reserve this IP in your router's DHCP settings so it doesn't change).*

---

## How to Build & Install

### Option A: Using Android Studio (Recommended)
1. Open **Android Studio**.
2. Select **Open** and select the `/marstek` directory.
3. Connect your Samsung phone via USB with *USB Debugging* enabled (or generate a debug APK: **Build > Build Bundle(s) / APK(s) > Build APK(s)**).
4. Click **Run ('app')** to install directly to your phone.

### Option B: Using Gradle CLI
```bash
cd /home/mrebe/Documents/other/marstek
./gradlew assembleDebug
```
The APK will be generated at:
`app/build/outputs/apk/debug/app-debug.apk`

Copy this `.apk` to your Samsung phone and tap to install.

---

## Setup on your Samsung Phone

1. **Open the "Marstek Venus Widget" app:**
   * Enter your Marstek Venus D's local IP (e.g., `192.168.1.150`).
   * Keep the port set to `30000`.
   * Tap **Test Local Connection** to confirm communication.
   * Tap **Save and Update Widget**.

2. **Add the Widget to your Samsung Home Screen:**
   * Go to your Samsung home screen.
   * Long-press (touch and hold) any empty space.
   * Tap **Widgets** at the bottom.
   * Search for or scroll to **Marstek Venus Widget**.
   * Drag it onto your home screen and resize as desired (optimal size: 3x2).

3. **Samsung Battery Optimization Tip:**
   * Go to **Settings > Apps > Marstek Venus Widget > Battery**.
   * Select **Unrestricted** so One UI doesn't put background updates to sleep when the screen is off.
