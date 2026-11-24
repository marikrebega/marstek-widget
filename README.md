# Marstek Venus Widget (React + Local UDP Bridge)

A web application and live status widget for **Marstek Venus D** energy storage systems. It mirrors the widget telemetry and local UDP `ES.GetStatus` connection flow from the Android app using a React frontend and a Node.js/Express UDP proxy on port `30000`.

## Features

- **Full & Compact Widget Views**: Switch between the full `390×720` widget (charging, discharging, idle states with circular SOC gauge, discharge/charge limit markers, time-to-limit estimates, and 24-hour power outage schedule bar) and the compact `360×170` widget.
- **Direct Local UDP Bridge (`ES.GetStatus`)**: Queries your Marstek battery over UDP on port `30000` (with retry and `Marstek.GetDevice` fallback probe) via `/api/marstek/status`.
- **Configurable Limits & Outage Schedule**: Customize discharge/charge limits (`10%` / `90%`) and today's planned outage intervals (`Графік відключень світла`), persisted in `localStorage`.
- **Demo Mode**: Preview Charging, Discharging, and Idle widget states without a physical Marstek battery on the local network.

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser. For production:

```bash
npm run build
npm start
```
