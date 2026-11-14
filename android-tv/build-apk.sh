#!/usr/bin/env bash
# Dependency-free Android build: Java 17+ and official SDK platform/build-tools 35.
set -euo pipefail
project_dir="$(cd "$(dirname "$0")" && pwd)"
: "${ANDROID_SDK_ROOT:?Set ANDROID_SDK_ROOT to an SDK with platforms;android-35 and build-tools;35.0.0}"
tools="$ANDROID_SDK_ROOT/build-tools/35.0.0"
platform="$ANDROID_SDK_ROOT/platforms/android-35/android.jar"
build="$project_dir/build"
output="$project_dir/../downloads"
rm -rf "$build/classes" "$build/dex"
mkdir -p "$build/classes" "$build/dex" "$output"
"$tools/aapt2" compile --dir "$project_dir/res" -o "$build/resources.zip"
"$tools/aapt2" link -o "$build/base.apk" --manifest "$project_dir/AndroidManifest.xml" -I "$platform" "$build/resources.zip"
find "$project_dir/src" -name '*.java' -print > "$build/sources.txt"
javac --release 8 -classpath "$platform" -d "$build/classes" @"$build/sources.txt"
jar cf "$build/classes.jar" -C "$build/classes" .
"$tools/d8" --min-api 24 --lib "$platform" --output "$build/dex" "$build/classes.jar"
python3 - "$build" <<'PY'
import sys, zipfile
from pathlib import Path
build = Path(sys.argv[1])
with zipfile.ZipFile(build / 'base.apk', 'a') as apk:
    for dex in sorted((build / 'dex').glob('*.dex')):
        apk.write(dex, dex.name)
PY
"$tools/zipalign" -f 4 "$build/base.apk" "$build/aligned.apk"
# Preview key is local and ignored by Git. Keep it to install updates over this preview.
preview_key="${WORDSHIFT_PREVIEW_KEY:-$project_dir/.local-preview-key.jks}"
if [ ! -f "$preview_key" ]; then
  keytool -genkeypair -keystore "$preview_key" -storepass android -keypass android -alias wordshift-preview -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=WORD SHIFT Preview' -noprompt
fi
"$tools/apksigner" sign --v4-signing-enabled false --ks "$preview_key" --ks-key-alias wordshift-preview --ks-pass pass:android --key-pass pass:android --out "$output/word-shift-tv-preview.apk" "$build/aligned.apk"
"$tools/apksigner" verify --verbose "$output/word-shift-tv-preview.apk"
(cd "$output" && sha256sum word-shift-tv-preview.apk > word-shift-tv-preview.apk.sha256)
printf 'APK created: %s\n' "$output/word-shift-tv-preview.apk"
