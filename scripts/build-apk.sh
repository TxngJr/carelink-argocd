#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mobile_dir="$project_dir/care-link"
output_dir="$project_dir/artifacts"

export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://carelink.denmannsolutions.com}"
export NODE_ENV="production"

# AGP 8.12 used by Expo SDK 56 officially targets Gradle 8.13 and JDK 17.
# A newer host JDK/Gradle combination can fail before Android compilation.
if command -v mise >/dev/null 2>&1 && mise where java@17 >/dev/null 2>&1; then
  JAVA_HOME="$(mise where java@17)"
  export JAVA_HOME
  export PATH="$JAVA_HOME/bin:$PATH"
fi

cd "$mobile_dir"
npm ci
npx expo prebuild --platform android --clean --no-install

# Expo prebuild currently emits Gradle 9.x. Pin the AGP 8.12 compatible wrapper
# for reproducible local builds; generated android/ remains gitignored.
sed -i -E \
  's#gradle-[0-9.]+-bin\.zip#gradle-8.13-bin.zip#' \
  android/gradle/wrapper/gradle-wrapper.properties

cd android
./gradlew assembleRelease

mkdir -p "$output_dir"
cp app/build/outputs/apk/release/app-release.apk "$output_dir/carelink.apk"
echo "APK: $output_dir/carelink.apk"
