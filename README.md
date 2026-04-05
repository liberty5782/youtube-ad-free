# YouTube Ad-Free Viewer

Watch YouTube videos without ads via [Invidious](https://invidious.io) and [Piped](https://piped.kavin.rocks) open-source frontends.

## Option A — Install as PWA (Instant, no build required)

1. Serve the app from any HTTPS host (e.g. GitHub Pages, Netlify, or a local server)
2. Open the URL in **Chrome on Android**
3. Tap the **"Install App"** button that appears in the header
4. The app is added to your home screen and launches full-screen with no browser chrome

> For local testing: `npx serve . -l 3000` then open `http://YOUR_LAN_IP:3000` in Chrome on your phone.

---

## Option B — Build a native Android APK (Capacitor)

### Prerequisites
- [Node.js](https://nodejs.org) 18+
- [Android Studio](https://developer.android.com/studio) with Android SDK installed
- Java 17+

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Add the Android project (only needed once)
npm run android:init

# 3. Sync web files into the native project
npm run android:sync

# 4. Open in Android Studio to build/sign the APK
npm run android:open
```

In Android Studio:
- **Run on device**: plug in your Android phone (USB debugging enabled) → click ▶
- **Build APK**: Build → Build Bundle(s)/APK(s) → Build APK(s)
  - APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`

### Install APK directly on device

```bash
# With adb
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Or transfer the `.apk` file to your phone and open it (enable "Install unknown apps" in Settings).

---

## How ad-blocking works

| Backend | Mechanism |
|---------|-----------|
| **Invidious** | Open-source YouTube frontend; proxies video streams server-side without loading Google's ad infrastructure |
| **Piped** | Same concept, different implementation |
| **youtube-nocookie.com** | YouTube's privacy-enhanced embed — reduces tracking but not fully ad-free |
