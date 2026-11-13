# WORD SHIFT for Android TV — installable preview

Download [`word-shift-tv-preview.apk`](../downloads/word-shift-tv-preview.apk). This is a sideloadable preview, not a Google Play or Amazon Appstore release.

## Install on your TV

1. Download the APK on your phone or computer. Transfer it to the TV using a USB drive or a file-transfer app supported by your TV.
2. On the TV, allow **Install unknown apps** for the file manager/installer you use. Open the APK and choose **Install**. Settings names vary by TV.
3. Launch **WORD SHIFT** from the TV's Apps list.
4. On a computer on the same Wi-Fi, run `npm start` from this repository. Keep that process running.
5. Enter the **Same-Wi-Fi phone address** printed by the server into the TV app, such as `http://192.168.1.20:4173`. Do not use `localhost` or the GitHub repository URL.
6. Choose a mode and create a room with the TV remote. Players open the same server address in their phone browsers, scan the lobby QR code with their phone camera, enter a nickname, and tap Ready. The phone must use the same Wi-Fi.
7. Use the remote to start. The TV host occupies one player slot; use **Phone view** and the on-screen letter keyboard to take the host's turns. A separate spectator-only TV role is not implemented.

This APK is a TV client. It does not bundle or run the Node.js server. A computer on your Wi-Fi, or a separately hosted server, is still required. There is no hosted service included yet. Install the updated server files from this commit: earlier server versions do not serve `tv.js`.

## Remote controls

- **Arrows:** move between visible controls; the turquoise outline shows focus.
- **OK / Select:** activate a button or edit a field. The host can play using the letter picker and on-screen letter buttons.
- **Computer difficulty selector:** Left/Right or OK cycles levels.
- **Back / Menu:** native TV menu with Resume, Reload/reconnect, Change server, and Exit.
- Saved server address and room session survive reopening/reloading. Server restarts still lose in-memory rooms.

## Compatibility and verification

- Android 7.0/API 24+; intended for Android TV, Google TV, and Android-based Fire TV devices with a working, up-to-date system WebView. No native CPU-specific library is bundled.
- Compiled with official Android SDK 35; APK v2/v3 signature verification and manifest/launcher checks pass.
- Server-address/origin unit tests and Chromium remote-navigation/phone-joining smoke checks pass. Existing Node regression suite also passes.
- Not installed on a physical TV or Android emulator in this environment. In particular, TV keyboard, WebView availability, vendor launcher behavior, and Fire TV compatibility still require device testing. No Play Store/Appstore certification is claimed.

## Build

Use Java 17+ (tested with Temurin 21), Python 3, Android SDK `platforms;android-35` and `build-tools;35.0.0`, then:

```sh
export ANDROID_SDK_ROOT=/path/to/android-sdk
bash android-tv/build-apk.sh
```

The script uses official `aapt2`, `javac`, `d8`, `zipalign`, and `apksigner`; Gradle and third-party Android runtime libraries are not required. Output goes to `downloads/`. The app is preview-signed with a local, Git-ignored key (`android-tv/.local-preview-key.jks`); keep it for installable updates. Builds signed with a different key require uninstalling the earlier preview, which clears saved TV settings/sessions. Production signing and store distribution remain future work.

Run native address tests:

```sh
mkdir -p android-tv/build/test-classes
javac -d android-tv/build/test-classes android-tv/src/com/wordshift/tv/ServerAddress.java android-tv/tests/ServerAddressTest.java
java -cp android-tv/build/test-classes ServerAddressTest
```

Run `scripts/tv-smoke.cjs` with the same optional Playwright environment variables described in the root README. It requires the server already running.

Official references: [TV launcher, banner, and touchscreen declarations](https://developer.android.com/training/tv/get-started/create), [WebView configuration and navigation](https://developer.android.com/develop/ui/views/layout/webapps/webview).

Preview 0.3.1 adds same-Wi-Fi QR joining in the lobby. Update/restart the Node server from the latest repository first, then use Reload/reconnect in the TV app. The existing TV APK can display QR joining after the server update; the newer APK also explains scanning on its setup screen. A QR appears after connection and room creation, not on the initial server-address screen.
