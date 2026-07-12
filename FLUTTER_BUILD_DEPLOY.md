# Flutter App Build & Deploy Guide
Complete step-by-step commands for building and deploying the Merchant App

---

## 📱 Table of Contents
1. [Check Connected Devices](#1-check-connected-devices)
2. [Clean Old Installations](#2-clean-old-installations)
3. [Build APK](#3-build-apk)
4. [Install APK](#4-install-apk)
5. [Troubleshooting](#5-troubleshooting)

---

## 1. Check Connected Devices

### Check if device is connected
```bash
adb devices
```

**Expected Output:**
```
List of devices attached
CPH2341           device
```

### Check device info
```bash
adb shell getprop ro.product.model
adb shell getprop ro.product.manufacturer
```

### Connect device wirelessly (optional)
```bash
# First connect via USB, then:
adb tcpip 5555
adb connect <device-ip>:5555
```

---

## 2. Clean Old Installations

### List all merchant packages
```bash
adb shell pm list packages | Select-String "merchant"
```

**Common packages:**
- `com.pasuai.merchant` (Production)
- `com.example.merchant_app` (Development)

### Uninstall specific package
```bash
# Uninstall by package name
adb uninstall com.pasuai.merchant
adb uninstall com.example.merchant_app
```

### Uninstall without knowing package name
```bash
# List all packages with "merchant"
adb shell pm list packages | Select-String "merchant"

# Uninstall each found package
adb uninstall <package_name>
```

### Verify uninstallation
```bash
adb shell pm list packages | Select-String "merchant"
# Should return nothing if all uninstalled
```

---

## 3. Build APK

### Navigate to Flutter project
```bash
cd d:\Project\MerchantAPP_Anti29JUN\MerchantAPP_Anti\merchant_app
```

### Clean build cache (recommended before new build)
```bash
flutter clean
flutter pub get
```

### Build APK - Debug (for testing)
```bash
flutter build apk --debug
```
**Output:** `build/app/outputs/flutter-apk/app-debug.apk`

### Build APK - Release (for production)
```bash
flutter build apk --release
```
**Output:** `build/app/outputs/flutter-apk/app-release.apk`

### Build APK - Split by ABI (smaller file size)
```bash
flutter build apk --split-per-abi --release
```
**Output:** Multiple APKs:
- `app-armeabi-v7a-release.apk` (32-bit ARM)
- `app-arm64-v8a-release.apk` (64-bit ARM - most common)
- `app-x86_64-release.apk` (64-bit x86)

### Build APK with specific flavor
```bash
flutter build apk --release --flavor production
```

### Check APK size
```bash
ls -lh build/app/outputs/flutter-apk/
```

---

## 4. Install APK

### Install via Flutter (automatic - easiest method)
```bash
# Debug build and install
flutter run --debug

# Release build and install
flutter run --release

# Install without running
flutter install
```

### Install APK file directly
```bash
# Install release APK
adb install build/app/outputs/flutter-apk/app-release.apk

# Install debug APK
adb install build/app/outputs/flutter-apk/app-debug.apk

# Force reinstall (if already installed)
adb install -r build/app/outputs/flutter-apk/app-release.apk
```

### Install specific ABI APK
```bash
# For 64-bit ARM devices (most common)
adb install build/app/outputs/flutter-apk/app-arm64-v8a-release.apk

# For 32-bit ARM devices
adb install build/app/outputs/flutter-apk/app-armeabi-v7a-release.apk
```

### Install to specific device (multiple devices connected)
```bash
# List devices
adb devices

# Install to specific device
adb -s CPH2341 install build/app/outputs/flutter-apk/app-release.apk
```

---

## 5. Troubleshooting

### Error: INSTALL_FAILED_UPDATE_INCOMPATIBLE
**Cause:** App signature mismatch (debug vs release)

**Solution:**
```bash
# Uninstall old version first
adb uninstall com.pasuai.merchant
# Then install new version
adb install build/app/outputs/flutter-apk/app-release.apk
```

### Error: Insufficient storage
**Solution:**
```bash
# Clear app cache
adb shell pm clear com.pasuai.merchant

# Or clear device cache
adb shell pm trim-caches 1G
```

### Error: Device not found
**Solution:**
```bash
# Kill and restart ADB server
adb kill-server
adb start-server
adb devices
```

### Error: Permission denied
**Solution:**
```bash
# Enable USB debugging on device
# Settings > Developer Options > USB Debugging

# Authorize computer on device
adb devices
# (Check device screen for authorization prompt)
```

### App crashes on startup
**Solution:**
```bash
# Check logs
adb logcat | Select-String "flutter"
adb logcat | Select-String "merchant"

# Clear app data
adb shell pm clear com.pasuai.merchant

# Reinstall
adb uninstall com.pasuai.merchant
flutter install
```

---

## 🚀 Quick Commands Reference

### Complete Clean Build & Install Flow
```bash
# 1. Navigate to project
cd d:\Project\MerchantAPP_Anti29JUN\MerchantAPP_Anti\merchant_app

# 2. Clean old installation
adb shell pm list packages | Select-String "merchant"
adb uninstall com.pasuai.merchant

# 3. Clean build cache
flutter clean
flutter pub get

# 4. Build release APK
flutter build apk --release

# 5. Install on device
adb install build/app/outputs/flutter-apk/app-release.apk

# Or simply:
flutter run --release
```

### Fastest Development Cycle
```bash
# Hot reload during development
flutter run

# Press 'r' in terminal for hot reload
# Press 'R' for hot restart
# Press 'q' to quit
```

### Check App Version on Device
```bash
# Get package info
adb shell dumpsys package com.pasuai.merchant | Select-String "versionName"
adb shell dumpsys package com.pasuai.merchant | Select-String "versionCode"
```

### Launch App from Command Line
```bash
# Launch app
adb shell monkey -p com.pasuai.merchant -c android.intent.category.LAUNCHER 1

# Or using am (activity manager)
adb shell am start -n com.pasuai.merchant/.MainActivity
```

### Clear App Data Without Uninstall
```bash
# Clear all data
adb shell pm clear com.pasuai.merchant

# This will:
# - Clear app cache
# - Clear app data
# - Reset app to fresh install state
# - But keep app installed
```

---

## 📦 Build Variants

### Debug Build
- **Purpose:** Development & testing
- **Size:** Larger (~50-60 MB)
- **Performance:** Slower
- **Features:** Hot reload, debugging enabled
- **Command:** `flutter build apk --debug`

### Release Build
- **Purpose:** Production deployment
- **Size:** Smaller (~20-30 MB)
- **Performance:** Optimized
- **Features:** Obfuscated, optimized
- **Command:** `flutter build apk --release`

### Profile Build
- **Purpose:** Performance profiling
- **Size:** Medium
- **Performance:** Near-release
- **Features:** Debugging + optimization
- **Command:** `flutter build apk --profile`

---

## 🔐 Signing APK (For Production)

### Check if APK is signed
```bash
# Windows (with Java JDK installed)
jarsigner -verify -verbose -certs build/app/outputs/flutter-apk/app-release.apk
```

### Generate keystore (first time only)
```bash
keytool -genkey -v -keystore merchant-app-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias merchant
```

### Configure signing in `android/key.properties`
```properties
storePassword=<password>
keyPassword=<password>
keyAlias=merchant
storeFile=<path-to-keystore>/merchant-app-key.jks
```

---

## 📊 Performance Optimization

### Analyze APK size
```bash
flutter build apk --analyze-size --release
```

### Build with tree-shake-icons (removes unused icons)
```bash
flutter build apk --release --tree-shake-icons
```

### Build with split-debug-info (for crash reporting)
```bash
flutter build apk --release --split-debug-info=build/debug-info
```

---

## 🌐 Network Debugging

### Monitor network requests
```bash
# Enable network logging
adb shell setprop log.tag.okhttp DEBUG

# View network logs
adb logcat | Select-String "okhttp"
```

### Check API connectivity from device
```bash
# Shell into device
adb shell

# Test API endpoint
curl https://app.pasuai.online/api/health

# Or using wget
wget -qO- https://app.pasuai.online/api/health
```

---

## 📱 Multiple Device Management

### List all connected devices
```bash
adb devices -l
```

### Install to specific device
```bash
adb -s <device-id> install app-release.apk
```

### Run on specific device
```bash
flutter run -d <device-id>
```

### Uninstall from specific device
```bash
adb -s <device-id> uninstall com.pasuai.merchant
```

---

## 🔄 Update Workflow

### For Production Update:
```bash
# 1. Pull latest code
git pull origin main

# 2. Update dependencies
cd merchant_app
flutter pub get

# 3. Increment version in pubspec.yaml
# version: 1.0.1+2  (version name + build number)

# 4. Clean and build
flutter clean
flutter build apk --release

# 5. Uninstall old version
adb uninstall com.pasuai.merchant

# 6. Install new version
adb install build/app/outputs/flutter-apk/app-release.apk

# 7. Test the app
flutter run --release
```

---

## 💡 Tips & Best Practices

1. **Always test on real device** before production
2. **Use release build** for performance testing
3. **Clear app data** when testing login/auth flows
4. **Keep keystore safe** - backup merchant-app-key.jks
5. **Increment version** for each build
6. **Test on different Android versions** if possible
7. **Check logs** if app crashes: `adb logcat`
8. **Use split-per-abi** for smaller APK sizes
9. **Sign APKs** for production distribution
10. **Document breaking changes** in version updates

---

## 📞 Common Package Names

- Production: `com.pasuai.merchant`
- Development: `com.example.merchant_app`

---

## 📝 Version Management

### Check current version
```bash
# In pubspec.yaml
grep "version:" merchant_app/pubspec.yaml
```

### Version format
```
version: 1.0.1+2
         │ │ │  └─ Build number (integer, increment each build)
         │ │ └──── Patch version
         │ └────── Minor version
         └──────── Major version
```

### Update version
```bash
# Edit pubspec.yaml
version: 1.0.2+3  # From 1.0.1+2
```

---

**Last Updated:** 2026-07-09  
**Project:** Merchant App - ISS Payment Gateway  
**Package:** com.pasuai.merchant
