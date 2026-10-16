# MediLink AI — Native Android Mobile Client

The MediLink AI Android client is a native Kotlin application built with Jetpack Compose, Coroutines, and the Android Health Connect SDK. It provides remote continuous biometric telemetry, wearable sensor synchronization, and immediate emergency SOS triggers with live GPS coordinates.

---

## 1. Directory Structure

```
android/
├── app/
│   ├── build.gradle.kts          # Application dependencies, plugins, and SDK versions
│   └── src/
│       ├── main/
│       │   ├── java/com/medilink/ai/
│       │   │   ├── MainActivity.kt        # Jetpack Compose UI bootstrap & navigation
│       │   │   ├── health/                # Health Connect SDK synchronization
│       │   │   ├── network/               # Retrofit / OkHttp REST & WebSocket clients
│       │   │   ├── ui/                    # Compose screens, components, and design system
│       │   │   └── viewmodel/             # Reactive MVVM ViewModels
│       │   └── res/                       # Android XML drawables, strings, colors
│       └── test/                          # Unit and instrumentation tests
├── gradle/
│   └── wrapper/                           # Gradle wrapper binary and configuration
├── build.gradle.kts                       # Root build configuration
├── settings.gradle.kts                    # Gradle project settings
├── gradle.properties                      # JVM arguments & AndroidX flags
└── gradlew.bat                            # Windows Gradle wrapper script
```

---

## 2. Key Capabilities
- **Health Connect Integration**: Syncs continuous Heart Rate, Steps, Oxygen Saturation, Blood Pressure, and Sleep records into the MediLink AI platform.
- **Hardware SOS Emergency Trigger**: Long-press volume or UI button triggers `/api/emergency/sos` with precise GPS coordinates.
- **Offline Resilience**: Local Room database queues telemetry readings during network outages.

---

## 3. Building & Running
```bash
# Build debug APK
./gradlew assembleDebug

# Run unit tests
./gradlew test
```
