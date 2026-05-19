# Fitness AI

校园健康体适能检测与管理系统。项目当前包含 FastAPI 后端、React Web 前端和 Android 客户端，围绕训练记录、数据统计、视频上传、姿态分析和动作评分构建一套可演示、可测试、可继续扩展的体适能 AI 服务平台。

## Current Scope

- Backend: 用户认证、用户资料、运动记录、统计分析、视频管理、MoveNet 姿态分析入口、规则化动作评分。
- Web: 登录注册、仪表盘、训练记录、记录详情、统计、视频中心、个人资料，以及与后端 API 的类型化调用。
- Android: Kotlin + Jetpack Compose，完整 MVVM 架构，AppContainer 单例 DI，支持运行时 BaseUrl 热切换、401 自动跳登录、全局 Snackbar、Material3 下拉刷新、NavHost 转场动画、Light/Dark 主题持久化、减少动效开关。覆盖登录/注册/首页趋势图/训练列表筛选排序/统计周期切换/姿态分析面板/设置/关于/个人中心。
- Quality: 后端 pytest 覆盖核心接口和服务；前端 Vitest 覆盖关键页面和 API service；Android 单元测试覆盖 repository、DTO 映射和 API workflow。

## Repository Layout

```text
.
├── app/                         # FastAPI backend
│   ├── api/                     # Route modules
│   ├── middleware/              # Request logging and middleware
│   ├── models/                  # SQLAlchemy models
│   ├── schemas/                 # Pydantic schemas
│   ├── services/                # Pose analysis and scoring services
│   └── utils/                   # Security, sanitizer, video storage helpers
├── tests/                       # Backend pytest suite
├── scripts/                     # DB init, seed, OpenAPI export helpers
├── Fitness-ai-frontend/         # Vite + React web app
├── Fitness-ai-android/          # Android Kotlin + Compose app
├── openspec/                    # Requirement/spec workflow artifacts
├── uploads/                     # Local uploaded files, ignored for production use
├── logs/                        # Runtime logs, ignored
├── requirements.txt             # Backend dependencies
├── requirements-movenet.example.txt
└── pytest.ini
```

Local runtime artifacts are intentionally ignored: `.env`, `venv/`, `logs/`, `uploads/`, `Fitness-ai-frontend/node_modules/`, `Fitness-ai-frontend/dist/`, Android `.gradle/`, `app/build/`, `local.properties`, APK/AAB outputs and TypeScript build info.

## Tech Stack

| Area | Stack |
| --- | --- |
| Backend API | Python 3.13, FastAPI, Uvicorn, Pydantic v2 |
| Database | PostgreSQL, SQLAlchemy 2 |
| Auth | bcrypt password hashing, JWT bearer tokens |
| AI / video | MoveNet-compatible pose runtime, OpenCV/TFLite optional runtime |
| Web | React 19, TypeScript, Vite, React Router, TanStack Query, Vitest |
| Android | Kotlin, Jetpack Compose (BOM 2024.12), Material3, MVVM, Retrofit/OkHttp, CameraX, Media3, DataStore, Navigation Compose |
| Quality | pytest, pytest-cov, flake8, black, Vitest, Gradle unit tests |

## Backend Quick Start

Requirements:

- Python 3.13
- PostgreSQL 14+
- A local database matching `DATABASE_URL`

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Generate a real secret and put it in `.env`:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Minimum backend `.env`:

```env
ENVIRONMENT=development
DATABASE_URL=postgresql://<username>:<password>@<host>:5432/<database>
SECRET_KEY=<generate-with-python-secrets-token-hex-32>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8080
VIDEO_STORAGE_BACKEND=local
VIDEO_UPLOAD_DIR=uploads/videos
LOG_LEVEL=INFO
LOG_FILE=logs/app.log
LOG_ROTATION=10MB
LOG_RETENTION=7days
LOG_FORMAT=text
MOVENET_ENABLED=false
```

Initialize and run:

```powershell
python -m scripts.init_db
python -m scripts.seed_data
uvicorn app.main:app --reload
```

Useful URLs:

- API root: `http://127.0.0.1:8000`
- Health check: `http://127.0.0.1:8000/health`
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

## Web Quick Start

```powershell
cd Fitness-ai-frontend
npm install
copy .env.example .env
npm run dev
```

`Fitness-ai-frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

If `VITE_API_BASE_URL` is missing in local development, the web app falls back to `http://127.0.0.1:8000`. Production builds should set it explicitly so deployed bundles never point to a developer machine.

Common commands:

```powershell
npm run test
npm run build
npm run generate:api
npm run check:api
```

`generate:api` exports the backend OpenAPI schema into `src/api/openapi.json` and regenerates `src/api/types.ts`. Run it whenever backend routes, schemas or response models change.

## Android Quick Start

Open `Fitness-ai-android` in Android Studio, or use the Gradle wrapper:

```powershell
cd Fitness-ai-android
.\gradlew.bat testDebugUnitTest assembleDebug
```

The app connects to the backend URL configured in `BuildConfig.BACKEND_BASE_URL` (default `http://10.0.2.2:8000/` for emulator). Users can change the BaseUrl at runtime in Settings without rebuilding.

To override at build time:

```powershell
.\gradlew.bat assembleDebug -PFITNESS_AI_BACKEND_BASE_URL=http://10.0.2.2:8000/
```

Use a LAN URL instead of `10.0.2.2` for a physical device. Release builds should use HTTPS API endpoints.

## API Overview

All protected endpoints use `Authorization: Bearer <access_token>`.

| Module | Prefix | Main capability |
| --- | --- | --- |
| Auth | `/api/auth` | Register and login |
| User | `/api/user` | Profile, password update, account deletion |
| Exercise | `/api/exercise` | Exercise catalog and training record CRUD |
| Stats | `/api/stats` | Summary, weekly stats and personal bests |
| Video | `/api/video` | Authenticated video upload, deletion and delivery |
| AI | `/api/ai` | Video pose analysis and exercise pose scoring |

Auth flow:

1. Web or Android sends username/password to `POST /api/auth/login`.
2. Backend returns `{ "access_token": "...", "token_type": "bearer" }`.
3. Client stores the access token locally and sends it as a bearer token.
4. Backend returns `401` for missing, invalid or expired tokens.
5. Backend returns `403` when the user is known but not allowed to continue.

## Video And Pose Analysis

Videos must be accessed through backend APIs, not by exposing `uploads/videos` as a public static directory. The backend validates bearer tokens and record ownership before returning video content.

Local video storage:

```env
VIDEO_STORAGE_BACKEND=local
VIDEO_UPLOAD_DIR=uploads/videos
```

`local` mode is suitable for local development and simple single-instance deployments. Multi-instance deployments need shared storage, or a dedicated object-storage adapter with backend-controlled access.

MoveNet is disabled by default so the core API can run without heavy ML dependencies:

```env
MOVENET_ENABLED=false
MOVENET_MODEL_PATH=
MOVENET_MODEL_VARIANT=thunder
MOVENET_MIN_CONFIDENCE=0.3
MOVENET_SAMPLE_FPS=5
```

Optional runtime dependencies are documented in `requirements-movenet.example.txt`. The model file should be provided outside Git and referenced with `MOVENET_MODEL_PATH`.

## Verification

Backend:

```powershell
.\venv\Scripts\python.exe -m pytest -q
```

Latest local result: `177 passed`, total backend coverage about `87%`.

Web:

```powershell
cd Fitness-ai-frontend
npm run test
npm run build
```

Android (46 tests):

```powershell
cd Fitness-ai-android
.\gradlew.bat testDebugUnitTest assembleDebug
```

Code style:

```powershell
black app tests
flake8 app tests
```

## Development Rules

- Do not commit secrets, `.env`, local databases, logs, uploaded videos, model weights, build outputs or IDE-local files.
- Backend schema changes should include tests and regenerated Web OpenAPI artifacts.
- New protected endpoints must use the existing bearer-token dependency and ownership checks where user data is involved.
- New video storage behavior must preserve authenticated access; do not bypass `/api/video`.
- New SQLAlchemy models must be imported from `app/models/__init__.py` so `scripts.init_db` can create their tables.
- Android mock mode has been removed. All API calls go through `ApiClientHolder`. Test-only fakes live in `src/test`.

## Deployment Notes

Example separated deployment:

```env
# Backend
ENVIRONMENT=production
DATABASE_URL=postgresql://fitness_app:<password>@db.example.com:5432/fitness_ai
SECRET_KEY=<generate-with-python-secrets-token-hex-32>
ALLOWED_ORIGINS=https://fitness.example.com
```

```env
# Web build
VITE_API_BASE_URL=https://api.fitness.example.com
```

Production requirements:

- Use a random `SECRET_KEY`; never use examples or defaults.
- Set `ALLOWED_ORIGINS` to exact frontend origins.
- Use HTTPS for public clients and API endpoints.
- Store uploaded videos in a location all API instances can access.
- Keep logs and sensitive user data out of Git.

## Maintainer Checklist

Before pushing feature work:

```powershell
git status --short
.\venv\Scripts\python.exe -m pytest -q
cd Fitness-ai-frontend
npm run test
npm run build
cd ..\Fitness-ai-android
.\gradlew.bat testDebugUnitTest assembleDebug
```

Update this README when runtime setup, API contracts, deployment assumptions or supported client flows change.
