# Marstek Venus Widget

Production web companion and Android APK (with Home Screen Widgets) for **Marstek Venus D** energy storage systems and real-time Ukrainian power outage schedules.

## Features

- **Full & Compact Widgets (Web & Android Home Screen)**: Real-time circular SOC gauge, charging/discharging/idle mode (`pv_power - ongrid_power - offgrid_power`), direct time-to-100% / time-to-0% & Wh energy estimates, and 24-hour Kyiv-time outage bar.
- **Direct Local UDP Telemetry**: Queries Marstek (`ES.GetStatus`, `Bat.GetStatus`, `ES.GetMode`, with `Marstek.GetDevice` probe fallback) over LAN UDP port `30000`, plus a raw JSON-RPC log viewer inside the app.
- **Real Outage Schedule APIs**: Supports Прикарпаттяобленерго (`be-svitlo.oe.if.ua`), Yasno (Kyiv, Dnipro), and DTEK (Kyiv region, Odesa) with automatic today/tomorrow countdowns.
- **Automated Signed Release APK**: GitHub Actions builds `assembleRelease` with automatic Git-based versioning and optional persistent keystore signing via `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, and `KEY_PASSWORD` secrets.

## Running Web Version Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. For production build:

```bash
npm run build
npm start
```
