# Fitness AI Android

Kotlin + Jetpack Compose Android client for the Fitness AI platform.

## Architecture

```text
app/src/main/java/com/fitnessai/android/
├── app/                    # AppContainer, FitnessAiApplication, FitnessAiViewModel, FitnessAiApp
├── core/
│   ├── cache/              # CacheCleaner
│   ├── config/             # ApiClientHolder, RuntimeConfigStore
│   ├── network/            # NetworkMonitor (ConnectivityManager)
│   ├── session/            # SessionManager (401 gate + navigation events)
│   ├── snackbar/           # SnackbarController (global message channel)
│   └── theme/              # ThemeManager (DataStore persistence)
├── data/
│   ├── api/                # Retrofit services, DTOs, interceptors, error mapping
│   ├── config/             # BackendConfiguration
│   ├── model/              # Domain models
│   └── repository/         # Auth, Records, Stats, Analysis, Video repositories
└── ui/
    ├── about/              # AboutScreen
    ├── auth/               # LoginScreen/ViewModel, RegisterScreen/ViewModel, RegisterValidator
    ├── components/         # StateView, EmptyState, ErrorState, TrendChart, StatsChart,
    │                         AnalysisResultPanel, NetworkBanner, PullToRefresh
    ├── home/               # HomeScreen
    ├── profile/            # ProfileScreen
    ├── settings/           # SettingsScreen/ViewModel, ReducedMotionStore
    ├── stats/              # StatsScreen/ViewModel
    ├── training/           # TrainingListScreen, RecordDetailScreen, RecordEditorScreen,
    │                         RecordFilter, RecordFilterBar
    ├── theme/              # Color, Type, Spacing, Shape, Elevation, Illustrations, Theme
    └── video/              # VideoRecorderScreen, VideoPlayer
```

### Key Design Decisions

- **AppContainer** is the single dependency-graph root, created once in `FitnessAiApplication.onCreate()`. All ViewModels receive dependencies through `ViewModelProvider.Factory`.
- **ApiClientHolder** holds a `StateFlow<ApiServices>`. Repositories use a `ServicesProvider = () -> ApiServices` lambda, so a runtime BaseUrl change in Settings immediately affects the next API call without restarting the app.
- **SessionManager** centralizes 401 handling. The OkHttp interceptor calls `notifyUnauthorized()` which uses an `AtomicBoolean` gate to emit exactly one `NavigateToLogin` event per session. `onLoginSuccess()` resets the gate.
- **SnackbarController** is a `Channel<SnackbarMessage>` consumed by the root `Scaffold`. Screens dispatch messages via `LocalSnackbarController` instead of managing local state.
- **ReducedMotionStore** persists a user preference; `LocalReducedMotion` disables NavHost transitions and list animations when enabled.

## Tech Stack

| Layer | Libraries |
|-------|-----------|
| UI | Jetpack Compose (BOM 2024.12), Material3, Navigation Compose |
| Async | Kotlin Coroutines, StateFlow, SharedFlow |
| Network | Retrofit 2.11, OkHttp 4.12, kotlinx-serialization |
| Persistence | DataStore Preferences |
| Media | CameraX 1.4, Media3 ExoPlayer 1.5 |
| Testing | JUnit 4, kotlinx-coroutines-test, MockWebServer |

## Quick Start

```powershell
cd Fitness-ai-android
.\gradlew.bat testDebugUnitTest assembleDebug
```

Build against a local backend (emulator):

```powershell
.\gradlew.bat assembleDebug -PFITNESS_AI_BACKEND_BASE_URL=http://10.0.2.2:8000/
```

Physical device — use host LAN IP:

```powershell
.\gradlew.bat assembleDebug -PFITNESS_AI_BACKEND_BASE_URL=http://192.168.x.x:8000/
```

## Runtime Configuration

The app reads `BuildConfig.BACKEND_BASE_URL` at startup and syncs it with the persisted DataStore value. Users can change the BaseUrl in Settings at runtime — the change takes effect immediately without restarting.

Default: `http://10.0.2.2:8000/` (Android emulator → host loopback).

## Features

| Feature | Status |
|---------|--------|
| Login with 401/429/network error mapping | Done |
| Register with auto-login | Done |
| Light/Dark theme with 250ms color transition | Done |
| Theme persistence (System/Light/Dark) | Done |
| Design tokens (Color, Type, Spacing, Shape, Elevation) | Done |
| AppContainer full DI wiring | Done |
| SessionManager 401 gate + auto-navigate to login | Done |
| Global SnackbarController | Done |
| NetworkMonitor + offline banner | Done |
| Material3 PullToRefreshBox (offline-aware) | Done |
| NavHost slide+fade transitions (220ms) | Done |
| Reduced motion toggle | Done |
| Home: trend chart (7-day), metric cards | Done |
| Training list: search debounce, category filter, sort, animateItem | Done |
| Stats: week/month/year period switching, weekly endpoint | Done |
| Record detail: structured analysis panel (score/grade/confidence/feedback) | Done |
| Settings: BaseUrl hot-rebuild, theme, cache clear, logout | Done |
| About: version, licenses, feedback intent | Done |
| Profile: settings/about/logout entries | Done |
| Paparazzi screenshot regression | Deferred |
| jqwik property-based tests | Deferred |
| Full accessibility audit (contentDescription, 48dp) | Deferred |

## Tests

46 unit tests covering:

- Repository layer (auth, records, stats, video, analysis, scoring, workflow)
- API core (token store, interceptor, error mapper)
- UI logic (RegisterValidator, RecordFilter, AnalysisDisplayMapper, RuntimeConfig)
- ViewModels (LoginViewModel, RegisterViewModel, SettingsViewModel, SessionManager)

Run:

```powershell
.\gradlew.bat testDebugUnitTest
```

## Development Notes

- Source files are UTF-8. `gradle.properties` sets `-Dfile.encoding=UTF-8` for the Gradle daemon and Kotlin daemon. `build.gradle.kts` forces UTF-8 on Java compilation and test JVM args.
- Mock mode has been removed from production code. All API calls go through `ApiClientHolder`.
- The `InMemoryTrainingRecordRepository` in `src/test` is for unit tests only.
- Release builds enable R8 minification (`isMinifyEnabled = true`).
