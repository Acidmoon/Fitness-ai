# Fitness AI

校园健康体适能检测与管理系统。项目包含 FastAPI 后端、React Web 前端和 Android 客户端，围绕训练记录、数据统计、视频上传、姿态分析和动作评分构建一套体适能 AI 服务平台。

## 功能概览

- **后端**：用户认证、用户资料、运动记录 CRUD、统计分析、视频管理、MoveNet 姿态分析、规则化动作评分
- **Web 前端**：登录注册、仪表盘、训练记录、记录详情、统计、视频中心、个人资料
- **Android 客户端**：完整 MVVM 架构，AppContainer 单例 DI，运行时 BaseUrl 热切换、401 自动跳登录、全局 Snackbar、Material3 下拉刷新、NavHost 转场动画、Light/Dark 主题持久化、训练列表筛选排序、统计周期切换、姿态分析面板、设置/关于/个人中心

## 技术栈

| 模块 | 技术 |
|------|------|
| 后端 | Python 3.13、FastAPI、Uvicorn、Pydantic v2、SQLAlchemy 2、PostgreSQL |
| 认证 | bcrypt 密码哈希、JWT Bearer Token |
| AI/视频 | MoveNet 姿态运行时、OpenCV/TFLite（可选） |
| Web | React 19、TypeScript、Vite、React Router、TanStack Query |
| Android | Kotlin、Jetpack Compose (BOM 2024.12)、Material3、Retrofit/OkHttp、CameraX、Media3、DataStore |
| 测试 | pytest、Vitest、JUnit 4、MockWebServer |

## 项目结构

```text
.
├── app/                         # FastAPI 后端
│   ├── api/                     # 路由模块
│   ├── middleware/              # 请求日志中间件
│   ├── models/                  # SQLAlchemy 模型
│   ├── schemas/                 # Pydantic 模式
│   ├── services/                # 姿态分析与评分服务
│   └── utils/                   # 安全、清洗、视频存储工具
├── tests/                       # 后端 pytest 测试
├── scripts/                     # 数据库初始化、种子数据、OpenAPI 导出
├── Fitness-ai-frontend/         # Vite + React Web 应用
├── Fitness-ai-android/          # Android Kotlin + Compose 应用
├── requirements.txt             # 后端依赖
└── pytest.ini
```

## 快速开始

### 后端

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# 编辑 .env 填入数据库连接和 SECRET_KEY
python -m scripts.init_db
python -m scripts.seed_data
uvicorn app.main:app --reload
```

常用地址：

- API：`http://127.0.0.1:8000`
- Swagger UI：`http://127.0.0.1:8000/docs`
- ReDoc：`http://127.0.0.1:8000/redoc`

### Web 前端

```powershell
cd Fitness-ai-frontend
npm install
copy .env.example .env
npm run dev
```

### Android

```powershell
cd Fitness-ai-android
.\gradlew.bat assembleDebug
```

默认连接 `http://10.0.2.2:8000/`（模拟器 → 宿主机）。物理设备使用局域网 IP：

```powershell
.\gradlew.bat assembleDebug -PFITNESS_AI_BACKEND_BASE_URL=http://192.168.x.x:8000/
```

## 环境变量

### 后端 `.env`

```env
ENVIRONMENT=development
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
SECRET_KEY=<python -c "import secrets; print(secrets.token_hex(32))">
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
VIDEO_STORAGE_BACKEND=local
VIDEO_UPLOAD_DIR=uploads/videos
MOVENET_ENABLED=false
```

### Web `.env`

```env
VITE_API_BASE_URL=http://localhost:8000
```

## API 概览

所有受保护端点使用 `Authorization: Bearer <access_token>`。

| 模块 | 前缀 | 功能 |
|------|------|------|
| Auth | `/api/auth` | 注册、登录 |
| User | `/api/user` | 资料、密码修改、账号删除 |
| Exercise | `/api/exercise` | 动作目录、训练记录 CRUD |
| Stats | `/api/stats` | 汇总统计、周报、个人最佳 |
| Video | `/api/video` | 视频上传、删除、流式获取 |
| AI | `/api/ai` | 姿态分析、动作评分 |

## 视频与姿态分析

视频通过后端 API 访问，不直接暴露 `uploads/videos` 目录。后端验证 Bearer Token 和记录归属后返回视频内容。

MoveNet 默认关闭，核心 API 可在无 ML 依赖的情况下运行：

```env
MOVENET_ENABLED=false
MOVENET_MODEL_PATH=
MOVENET_MODEL_VARIANT=thunder
```

可选运行时依赖见 `requirements-movenet.example.txt`。

## 运行测试

```powershell
# 后端
.\venv\Scripts\python.exe -m pytest -q

# Web
cd Fitness-ai-frontend && npm run test

# Android
cd Fitness-ai-android && .\gradlew.bat testDebugUnitTest
```

## 开发规范

- 不提交 `.env`、`venv/`、`logs/`、`uploads/`、`node_modules/`、`build/` 等本地产物
- 后端 Schema 变更需同步更新 Web OpenAPI 类型（`npm run generate:api`）
- 新增受保护端点必须使用现有 Bearer Token 依赖和归属检查
- 视频存储行为必须保持认证访问，不绕过 `/api/video`
- Android Mock 模式已移除，所有 API 调用通过 ApiClientHolder
- 新增页面使用全局 SnackbarController 派发消息

## 部署说明

```env
# 后端生产环境
ENVIRONMENT=production
DATABASE_URL=postgresql://fitness_app:<password>@db.example.com:5432/fitness_ai
SECRET_KEY=<随机生成>
ALLOWED_ORIGINS=https://fitness.example.com

# Web 构建
VITE_API_BASE_URL=https://api.fitness.example.com
```

生产要求：

- 使用随机 `SECRET_KEY`
- `ALLOWED_ORIGINS` 设为精确前端域名
- 公网使用 HTTPS
- 视频存储使用所有实例可访问的共享存储
