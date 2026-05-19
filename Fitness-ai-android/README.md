# Fitness AI Android

校园健康体适能检测与管理系统 Android 客户端。基于 Kotlin + Jetpack Compose 构建，采用 MVVM 架构，通过 AppContainer 单例管理全局依赖。

## 功能

- 用户登录与注册（含 401/429/网络错误友好提示）
- Light/Dark 主题切换，250ms 颜色过渡动画，主题持久化
- 首页训练趋势图（近 7 日）与指标卡片
- 训练列表：搜索（300ms debounce）、类别筛选、排序
- 统计页：周/月/年周期切换，后端 weekly 端点 + 本地分桶
- 训练详情：结构化姿态分析面板（评分等级/置信度/有效帧/反馈/详细数据折叠）
- 设置页：BaseUrl 运行时热切换、主题、缓存清除、减少动效开关、退出登录
- 关于页：版本信息、开源许可、反馈邮件
- 全局离线横幅 + Material3 下拉刷新（离线时提示本地缓存）
- 401 自动跳转登录页 + Snackbar 提示
- NavHost slide+fade 转场动画

## 技术栈

| 层级 | 技术 |
|------|------|
| UI | Jetpack Compose (BOM 2024.12)、Material3、Navigation Compose |
| 异步 | Kotlin Coroutines、StateFlow、SharedFlow |
| 网络 | Retrofit 2.11、OkHttp 4.12、kotlinx-serialization |
| 持久化 | DataStore Preferences |
| 媒体 | CameraX 1.4、Media3 ExoPlayer 1.5 |
| 测试 | JUnit 4、kotlinx-coroutines-test、MockWebServer |

## 项目结构

```text
app/src/main/java/com/fitnessai/android/
├── app/          # AppContainer、Application、根 ViewModel、导航宿主
├── core/         # 基础设施（缓存、配置、网络、会话、Snackbar、主题）
├── data/         # API 层（Retrofit 接口、DTO、拦截器）+ 仓库层
└── ui/           # 各页面 Screen + ViewModel + 通用组件 + 设计 token
```

## 快速开始

```powershell
cd Fitness-ai-android
.\gradlew.bat assembleDebug
```

默认连接 `http://10.0.2.2:8000/`（模拟器 → 宿主机）。构建时可覆盖：

```powershell
.\gradlew.bat assembleDebug -PFITNESS_AI_BACKEND_BASE_URL=http://192.168.x.x:8000/
```

用户也可在应用内「设置 → 网络」运行时修改 BaseUrl，无需重新构建。

## 运行测试

```powershell
.\gradlew.bat testDebugUnitTest
```

## 架构要点

- **AppContainer**：`Application.onCreate()` 创建一次，持有 TokenStore、ApiClientHolder、SessionManager、ThemeManager、RuntimeConfigStore、NetworkMonitor、SnackbarController、CacheCleaner、ReducedMotionStore 和所有仓库。
- **ApiClientHolder**：持有 `StateFlow<ApiServices>`，仓库通过 `() -> ApiServices` 每次调用取最新实例，设置页 BaseUrl 保存后立即生效。
- **SessionManager**：OkHttp 拦截器检测 401 → `notifyUnauthorized()` → AtomicBoolean gate 保证单次 emit → 根 Composable 订阅事件跳转登录。
- **SnackbarController**：`Channel<SnackbarMessage>` 全局消息通道，根 Scaffold 串行消费，各页面通过 CompositionLocal 派发。

## 开发注意事项

- 源文件统一 UTF-8 编码
- Mock 模式已移除，所有 API 调用通过 ApiClientHolder
- 新增页面使用 `LocalSnackbarController` 派发消息，不要使用页面内局部状态
- Release 构建启用 R8 混淆
