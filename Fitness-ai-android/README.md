# Fitness AI Android

校园健康体适能检测与管理系统 Android 客户端。基于 Kotlin + Jetpack Compose 构建，采用完整 MVVM 架构，通过 AppContainer 单例管理全局依赖，支持运行时 BaseUrl 热切换、401 自动跳转登录、全局 Snackbar 消息、Material3 下拉刷新、NavHost 转场动画、Light/Dark 主题持久化和减少动效开关。

## 当前状态

Android 客户端已完成核心功能开发，覆盖登录/注册/首页趋势图/训练列表筛选排序/统计周期切换/姿态分析结构化面板/设置/关于/个人中心。Mock 模式已移除，所有 API 调用通过 `ApiClientHolder` 统一管理。

验证命令：

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug
```

最新结果：46 个单元测试全部通过，`BUILD SUCCESSFUL`。

## 目录结构

```text
app/src/main/java/com/fitnessai/android/
├── app/                    # AppContainer、FitnessAiApplication、FitnessAiViewModel、FitnessAiApp
├── core/
│   ├── cache/              # CacheCleaner（文件缓存清理）
│   ├── config/             # ApiClientHolder、RuntimeConfigStore
│   ├── network/            # NetworkMonitor（ConnectivityManager 订阅）
│   ├── session/            # SessionManager（401 gate + 导航事件）
│   ├── snackbar/           # SnackbarController（全局消息通道）
│   └── theme/              # ThemeManager（DataStore 持久化）
├── data/
│   ├── api/                # Retrofit 服务接口、DTO、拦截器、错误映射
│   ├── config/             # BackendConfiguration
│   ├── model/              # 领域模型
│   └── repository/         # Auth、Records、Stats、Analysis、Video 仓库
└── ui/
    ├── about/              # 关于页
    ├── auth/               # 登录页/ViewModel、注册页/ViewModel、RegisterValidator
    ├── components/         # StateView、EmptyState、ErrorState、TrendChart、StatsChart、
    │                         AnalysisResultPanel、NetworkBanner、PullToRefresh
    ├── home/               # 首页
    ├── profile/            # 个人中心
    ├── settings/           # 设置页/ViewModel、ReducedMotionStore
    ├── stats/              # 统计页/ViewModel
    ├── training/           # 训练列表、记录详情、记录编辑、RecordFilter、RecordFilterBar
    ├── theme/              # Color、Type、Spacing、Shape、Elevation、Illustrations、Theme
    └── video/              # 视频录制、视频播放
```

## 技术栈

| 层级 | 技术 |
|------|------|
| UI | Jetpack Compose (BOM 2024.12)、Material3、Navigation Compose |
| 异步 | Kotlin Coroutines、StateFlow、SharedFlow |
| 网络 | Retrofit 2.11、OkHttp 4.12、kotlinx-serialization |
| 持久化 | DataStore Preferences |
| 媒体 | CameraX 1.4、Media3 ExoPlayer 1.5 |
| 测试 | JUnit 4、kotlinx-coroutines-test、MockWebServer |

## 架构设计

### AppContainer（依赖图根节点）

`FitnessAiApplication.onCreate()` 中创建一次，持有：

- `TokenStore` — 访问令牌持久化
- `ApiClientHolder` — 持有 `StateFlow<ApiServices>`，支持运行时 rebuild
- `SessionManager` — 401 拦截 → gate → 单次导航事件
- `ThemeManager` — 主题模式持久化
- `RuntimeConfigStore` — BaseUrl 持久化
- `NetworkMonitor` — 网络状态订阅
- `SnackbarController` — 全局消息通道
- `CacheCleaner` — 文件缓存清理
- `ReducedMotionStore` — 减少动效开关
- `AppRepositories` — 所有仓库实例

所有 ViewModel 通过 `ViewModelProvider.Factory` 接收依赖。

### 运行时 BaseUrl 热切换

仓库使用 `ServicesProvider = () -> ApiServices` 函数类型，每次调用读取 `holder.services.value`。设置页保存新 BaseUrl 时：

1. `RuntimeConfig.BASE_URL_REGEX` 校验格式
2. `ApiClientHolder.rebuild(baseUrl)` 重建 Retrofit 实例
3. `RuntimeConfigStore.setBaseUrl(baseUrl)` 持久化到 DataStore
4. 下一次 API 调用自动走新地址

### 401 会话管理

- `AuthorizationInterceptor` 检测 401 → 调用 `SessionManager.notifyUnauthorized()`
- `SessionManager` 内部 `AtomicBoolean` gate 保证每个登录周期只 emit 一次 `NavigateToLogin` 事件
- `FitnessAiApp` 订阅 `events` → `popUpTo(login)` + Snackbar 提示
- `onLoginSuccess()` 重置 gate，后续 401 可再次触发

### 全局 Snackbar

`SnackbarController` 内部 `Channel<SnackbarMessage>(BUFFERED)`，根 `Scaffold` 的 `LaunchedEffect` 串行消费并调用 `SnackbarHostState.showSnackbar()`。各页面通过 `LocalSnackbarController.current.enqueue(...)` 派发消息。

## 快速开始

```powershell
cd Fitness-ai-android
.\gradlew.bat testDebugUnitTest assembleDebug
```

针对本地后端构建（模拟器）：

```powershell
.\gradlew.bat assembleDebug -PFITNESS_AI_BACKEND_BASE_URL=http://10.0.2.2:8000/
```

物理设备使用宿主机局域网 IP：

```powershell
.\gradlew.bat assembleDebug -PFITNESS_AI_BACKEND_BASE_URL=http://192.168.x.x:8000/
```

## 运行时配置

应用启动时读取 `BuildConfig.BACKEND_BASE_URL`，并与 DataStore 中持久化的值同步。用户可在设置页运行时修改 BaseUrl，修改立即生效无需重启。

默认值：`http://10.0.2.2:8000/`（Android 模拟器 → 宿主机回环）。

## 功能状态

| 功能 | 状态 |
|------|------|
| 登录（401/429/网络错误映射） | 已完成 |
| 注册（自动登录） | 已完成 |
| Light/Dark 主题 + 250ms 颜色过渡动画 | 已完成 |
| 主题持久化（跟随系统/浅色/深色） | 已完成 |
| 设计 token（Color、Type、Spacing、Shape、Elevation） | 已完成 |
| AppContainer 完整依赖注入 | 已完成 |
| SessionManager 401 gate + 自动跳转登录 | 已完成 |
| 全局 SnackbarController | 已完成 |
| NetworkMonitor + 离线横幅 | 已完成 |
| Material3 PullToRefreshBox（离线感知） | 已完成 |
| NavHost slide+fade 转场动画（220ms） | 已完成 |
| 减少动效开关 | 已完成 |
| 首页：趋势图（近 7 日）、指标卡片 | 已完成 |
| 训练列表：搜索 debounce、类别筛选、排序、animateItem | 已完成 |
| 统计：周/月/年切换、weekly 端点 | 已完成 |
| 记录详情：结构化分析面板（评分/等级/置信度/反馈） | 已完成 |
| 设置：BaseUrl 热重建、主题、缓存清除、退出登录 | 已完成 |
| 关于：版本、开源许可、反馈 Intent | 已完成 |
| 个人中心：设置/关于/退出入口 | 已完成 |
| Paparazzi 截图回归测试 | 延后 |
| jqwik 属性测试 | 延后 |
| 完整可访问性审计（contentDescription、48dp） | 延后 |

## 测试

46 个单元测试覆盖：

- 仓库层（auth、records、stats、video、analysis、scoring、workflow）
- API 核心（token store、interceptor、error mapper）
- UI 逻辑（RegisterValidator、RecordFilter、AnalysisDisplayMapper、RuntimeConfig）
- ViewModel（LoginViewModel、RegisterViewModel、SettingsViewModel、SessionManager）

运行：

```powershell
.\gradlew.bat testDebugUnitTest
```

## 本地 API 模式验证

1. 启动 Fitness AI 后端，确认 `http://127.0.0.1:8000/` 可访问。
2. 构建模拟器 debug APK：

```powershell
.\gradlew.bat assembleDebug -PFITNESS_AI_BACKEND_BASE_URL=http://10.0.2.2:8000/
```

3. 物理设备替换为宿主机局域网地址，如 `http://192.168.1.20:8000/`。
4. 安装并启动，使用后端测试账号登录，选择角色，浏览首页/训练/统计。
5. 完整流程验证：刷新记录、新建训练、打开详情、添加视频、启动分析、评分、返回首页确认数据刷新。
6. 运行单元测试：

```powershell
.\gradlew.bat testDebugUnitTest
```

## 开发注意事项

- 源文件统一 UTF-8 编码。`gradle.properties` 为 Gradle daemon 和 Kotlin daemon 设置了 `-Dfile.encoding=UTF-8`，`build.gradle.kts` 强制 Java 编译和测试 JVM 使用 UTF-8。
- Mock 模式已从生产代码移除，所有 API 调用通过 `ApiClientHolder`。测试用 fake 仓库位于 `src/test`。
- Release 构建启用 R8 混淆（`isMinifyEnabled = true`）。
- 新增 API 端点后需同步更新 `ApiServices.kt` 接口和对应 DTO。
- 新增页面应通过 `LocalSnackbarController` 派发消息，不要使用页面内局部 `var message` 状态。
