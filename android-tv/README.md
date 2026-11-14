# WORD SHIFT for Android TV — 0.5.0 preview

[Download APK](../downloads/word-shift-tv-preview.apk). This is a sideloadable preview for Android TV/Google TV and Android-based Fire TV, not a store release.

The app now opens https://nikeelnaidoo5518.github.io/word-shift/ automatically. There is no server-address form or separate computer setup. **The GitHub Pages deployment must be enabled and verified first.** Internet is required.

## Install and play

1. Download the APK and transfer it to the TV using USB or a supported file-transfer app.
2. Allow Install unknown apps for your installer, open the APK and install.
3. Launch WORD SHIFT, choose a mode and create a room.
4. Phones scan the lobby QR, enter nicknames and tap Ready. Same Wi-Fi works; any working internet connection can join.
5. Start with the remote. Keep the TV app open/awake during play.

The TV host takes one player slot. Phone view and the on-screen keyboard let the host play with the remote. A separate spectator role is not implemented.

Arrows move focus; OK selects; Back/Menu opens Resume, Reload/reconnect and Exit. The native loading screen offers retry when the game cannot load. Same-browser room recovery is supported; clearing app data loses anonymous host identity.

## Verification and limits

Android API 24+ with an up-to-date system WebView. Compiled using official SDK 35; APK v2/v3 signature verification passes. Browser tests cover shared gameplay and remote/layout behavior. Physical TV installation, vendor keyboards/overscan and Fire TV compatibility are not yet verified.

## Build

Java 17+ (tested with 21), Python 3, SDK platform android-35 and build-tools 35.0.0:

```sh
ANDROID_SDK_ROOT=/path/to/android-sdk bash android-tv/build-apk.sh
```

Output is in `downloads/`. The local preview signing key is Git-ignored and reused for updates. A build signed with a different key requires uninstalling the old preview and loses saved sessions. CI-generated preview keys may differ. Production signing/store publication remain future work.
