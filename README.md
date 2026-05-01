# Fitness-ai Backend

校园健康体适能检测与管理系统，当前包含 FastAPI 后端与 Vite + React 前端，提供用户认证、运动记录管理、数据统计、视频上传，以及基于 MoveNet 的姿态分析与动作评分能力。

---

## 📋 目录

- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [API 接口概览](#api-接口概览)
- [快速开始](#快速开始)
- [运行测试](#运行测试)
- [开发进度](#开发进度)

---

## 🛠 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| Web 框架 | FastAPI | 0.129.0 | 高性能异步 API 框架 |
| ASGI 服务器 | Uvicorn | 0.41.0 | Python ASGI 服务器 |
| 数据库 | PostgreSQL | 14+ | 关系型数据库 |
| ORM | SQLAlchemy | 2.0.46 | Python SQL 工具包 |
| 密码加密 | bcrypt | 5.0.0 | 密码哈希库 |
| JWT 令牌 | python-jose | 3.5.0 | JWT 生成与验证 |
| 数据验证 | Pydantic | 2.12.5 | 数据验证与解析 |
| Python | Python | 3.13.9 | 运行环境 |

---

## 📁 项目结构

```
Fitness-ai-backend/
├── app/
│   ├── main.py                 # FastAPI 应用入口
│   ├── config.py               # 配置文件 (环境变量)
│   ├── database.py             # 数据库连接
│   ├── logging_config.py       # 日志系统配置
│   ├── exceptions.py           # 异常处理
│   ├── api/
│   │   ├── auth.py             # 认证接口 (注册/登录)
│   │   ├── ai.py               # AI 接口 (姿态分析/动作评分)
│   │   ├── exercise.py         # 运动接口 (动作库/记录)
│   │   ├── stats.py            # 数据统计接口
│   │   ├── user.py             # 用户资料管理 (新增)
│   │   └── video.py            # 视频上传接口
│   ├── middleware/
│   │   ├── __init__.py         # 中间件模块
│   │   └── logging_middleware.py # 请求日志中间件
│   ├── models/
│   │   ├── __init__.py         # 模型导出
│   │   ├── user.py             # 用户数据模型
│   │   └── exercise.py         # 运动数据模型
│   ├── schemas/
│   │   ├── __init__.py         # Schema 导出
│   │   ├── user.py             # 用户数据验证
│   │   ├── exercise.py         # 运动数据验证
│   │   ├── pose_analysis.py    # 姿态分析模型
│   │   ├── pose_scoring.py     # 动作评分模型
│   │   └── stats.py            # 数据统计模型
│   ├── services/
│   │   ├── pose_analysis_runtime.py   # MoveNet 运行时
│   │   ├── video_pose_analysis.py     # 视频姿态分析
│   │   └── exercise_pose_scoring.py   # 规则评分逻辑
│   └── utils/
│       ├── sanitizer.py        # 敏感信息脱敏
│       └── security.py         # 密码加密/JWT/认证
├── Fitness-ai-frontend/
│   ├── src/                    # React 前端源码
│   ├── package.json            # 前端依赖与脚本
│   └── vite.config.ts          # Vite 构建配置
├── tests/
│   ├── conftest.py             # 测试配置
│   ├── test_auth.py            # 认证模块测试
│   ├── test_ai_pose_analysis.py # AI 姿态分析接口测试
│   ├── test_exercise.py        # 运动记录测试
│   ├── test_exercise_pose_scoring.py # AI 动作评分测试
│   ├── test_pose_analysis_runtime.py # MoveNet 运行时测试
│   ├── test_stats.py           # 统计功能测试
│   ├── test_user.py            # 用户模块测试
│   └── test_video.py           # 视频模块测试
├── scripts/
│   ├── init_db.py              # 数据库初始化脚本
│   ├── seed_data.py            # 测试数据种子脚本
│   └── test_db.py              # 数据库连接测试
├── logs/                       # 日志目录 
│   └── app.log                 # 应用日志文件
├── uploads/videos/             # 视频存储目录
├── .env.example                # 环境变量模板
├── .flake8                     # flake8 配置
├── .gitignore                  # Git 忽略规则
├── pytest.ini                  # pytest 配置
├── requirements.txt            # 依赖列表
└── README.md                   # 项目文档
```

---

## 🔌 API 接口概览

### 认证模块 `/api/auth`
| 方法 | 路由 | 说明 | 认证 |
|------|------|------|------|
| POST | `/register` | 用户注册 | ❌ |
| POST | `/login` | 用户登录 | ❌ |

### 运动模块 `/api/exercise`
| 方法 | 路由 | 说明 | 认证 |
|------|------|------|------|
| POST | `/records` | 创建运动记录 | ✅ |
| GET | `/records` | 获取用户记录 (支持分页、日期范围、动作 ID 过滤) | ✅ |
| PUT | `/records/{record_id}` | 修改运动记录 | ✅ |
| DELETE | `/records/{record_id}` | 删除单条运动记录 | ✅ |
| DELETE | `/records` | 批量删除运动记录 | ✅ |
| GET | `/exercises` | 获取标准动作列表 | ❌ |

### 统计模块 `/api/stats`
| 方法 | 路由 | 说明 | 认证 |
|------|------|------|------|
| GET | `/stats/summary` | 综合统计 | ✅ |
| GET | `/stats/weekly` | 周统计 | ✅ |
| GET | `/stats/personal-best` | 个人最佳 | ✅ |

### 视频模块 `/api/video`
| 方法 | 路由 | 说明 | 认证 |
|------|------|------|------|
| POST | `/records/{record_id}/video` | 上传视频（支持 `keep_video` 参数） | ✅ |
| DELETE | `/records/{record_id}/video` | 删除视频 | ✅ |
| GET | `/videos/{filename}` | 访问视频（路径穿越防护） | ✅ |

### AI 模块 `/api/ai`
| 方法 | 路由 | 说明 | 认证 |
|------|------|------|------|
| POST | `/records/{record_id}/pose-analysis` | 触发记录视频姿态分析 | ✅ |
| GET | `/records/{record_id}/pose-analysis` | 获取已保存姿态分析结果 | ✅ |
| POST | `/records/{record_id}/pose-scoring` | 预览或显式应用 AI 动作评分 | ✅ |

### 用户模块 `/api/user`
| 方法 | 路由 | 说明 | 认证 |
|------|------|------|------|
| GET | `/profile` | 获取个人资料 | ✅ |
| PUT | `/profile` | 更新个人资料 | ✅ |
| PUT | `/password` | 修改密码 | ✅ |
| DELETE | `/account` | 注销账户（硬删除） | ✅ |

---

## 🚀 快速开始

### 1. 克隆仓库
```bash
git clone https://github.com/Acidmoon/Fitness-ai.git
cd Fitness-ai
```

### 2. 创建虚拟环境
```bash
python -m venv venv
```

### 3. 激活虚拟环境
```bash
# Windows PowerShell
venv\Scripts\Activate.ps1

# Linux/Mac
source venv/bin/activate
```

### 4. 安装依赖
```bash
pip install -r requirements.txt
```

### 5. 配置环境变量
```bash
# 复制环境变量模板
copy .env.example .env

# 生成安全密钥
python -c "import secrets; print(secrets.token_hex(32))"
```

编辑 `.env` 文件，填入配置：
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/fitness_ai
SECRET_KEY=your-random-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
LOG_LEVEL=INFO
LOG_FORMAT=text
```

**安全提示**：
- 不要使用默认的数据库连接字符串
- `SECRET_KEY` 必须使用随机生成的 32 字节密钥
- 生产环境 `ALLOWED_ORIGINS` 应设置为具体域名，不要用 `*`

### 6. 初始化数据库
```bash
python -m scripts.init_db
python -m scripts.seed_data
```

### 7. 启动服务
```bash
uvicorn app.main:app --reload
```

服务启动成功后访问：
- **服务地址**: http://127.0.0.1:8000
- **API 文档**: http://127.0.0.1:8000/docs
- **ReDoc**: http://127.0.0.1:8000/redoc
- **OpenAPI JSON**: http://127.0.0.1:8000/openapi.json

### 8. 启动前端
```bash
cd Fitness-ai-frontend
npm install
npm run dev
```

前端默认使用 Vite，本地可通过 `npm run build` 验证生产构建，通过 `npm run test` 运行 Vitest。

---

## 🧪 运行测试

### 基本命令

```bash
# 运行所有测试
pytest

# 运行特定模块
pytest tests/test_auth.py

# 运行特定测试类
pytest tests/test_auth.py::TestRegister

# 运行特定测试方法
pytest tests/test_auth.py::TestRegister::test_register_success

# 按关键字过滤测试
pytest -k "register"

# 生成覆盖率报告
pytest --cov=app --cov-report=html

# 清除 pytest 缓存（如遇缓存问题）
pytest --cache-clear
```

### 常见错误

```bash
# ❌ 错误用法
pytest -m tests.test_auth    # 0 测试被选中（-m 用于 marker 过滤，不是文件路径）

# ✅ 正确用法
pytest tests/test_auth.py    # 运行该文件的所有测试
```

### Windows 环境常见问题（venv 解释器失效）

如果激活虚拟环境后仍报错：`did not find executable ... WindowsApps ... python.exe`，说明 `venv` 绑定的基础解释器已失效。处理方式：

```bash
# 1) 删除并重建虚拟环境（示例）
rmdir /s /q venv
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 说明

| 参数 | 含义 | 示例 |
|------|------|------|
| 直接指定文件 | 运行指定文件的测试 | `pytest tests/test_auth.py` |
| `-k` | 按关键字过滤测试 | `pytest -k "login"` |
| `-m` | 按 marker 标记过滤（需先定义） | `pytest -m slow` |

当前测试状态：

- **后端**：`venv\Scripts\python -m pytest` 当前为 159 个测试用例（建议以本机 pytest 实测结果为准）
- **前端**：`cd Fitness-ai-frontend && npm run test` 当前为 23 个测试用例

---

## MoveNet 姿态分析运行时

MoveNet 姿态分析默认关闭，不影响普通后端启动。启用前需要额外安装 OpenCV、NumPy，以及与当前 Python 版本兼容的 TensorFlow Lite 解释器。当前仓库根目录的 `movenet/` 仅作为本地实验素材目录，默认不跟踪、不上传。

可选依赖参考：

```bash
pip install -r requirements-movenet.example.txt
```

环境变量：

```bash
MOVENET_ENABLED=false
MOVENET_MODEL_PATH=
MOVENET_MODEL_VARIANT=thunder
MOVENET_MIN_CONFIDENCE=0.3
MOVENET_SAMPLE_FPS=5
```

注意：本地 `movenet/` 目录内的 `tflite_runtime-2.18.0-cp310-cp310-win_amd64.whl` 只适配 Python 3.10；当前后端虚拟环境是 Python 3.13 时不能直接安装该 wheel。生产环境应通过 `MOVENET_MODEL_PATH` 指向外部提供的 `.tflite` 模型文件。

---

## 🛠 代码质量工具

### 格式化代码
```bash
black app/ tests/
```

### 检查代码风格
```bash
flake8 app/ tests/
```

当前代码状态：**flake8 检查通过** 

---

## 📝 日志系统

### 日志配置
日志系统使用 `loguru` 库，支持自动轮转和敏感信息脱敏。

**日志文件位置**: `logs/app.log`

**日志轮转策略**:
- 单个文件最大：10MB
- 保留时间：7 天
- 自动压缩备份文件

**敏感信息脱敏**:
- 密码：`***`
- 邮箱：`t***@example.com`
- Token: `eyJ***...`
- IP 地址：`192.168.1.***`

**查看日志**:
```bash
# 实时查看日志
tail -f logs/app.log

# 查看最近的日志
cat logs/app.log | tail -n 100
```

**日志级别配置** (`.env` 文件):
```bash
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR
LOG_FORMAT=text  # 或 json（生产环境）
```

---

## 📌 开发进度

### 已完成功能
- [x] 用户认证（注册/登录）
- [x] 用户资料管理（获取/更新/修改密码/注销）
- [x] 运动记录管理（创建/查询/修改/删除/批量删除）
- [x] 标准动作库
- [x] 数据统计接口
- [x] 视频上传功能
- [x] MoveNet 运行时配置与可用性保护
- [x] 记录视频姿态分析接口
- [x] 基于规则的动作评分接口（深蹲 / 俯卧撑）
- [x] React 前端基础工程与主流程页面
- [x] 记录详情页姿态分析与动作评分交互
- [x] 日期范围过滤
- [x] 动作 ID 过滤
- [x] 后端与前端测试体系建设
- [x] 代码质量工具集成（black, flake8）
- [x] 日志系统（敏感信息脱敏、请求日志、异常处理）
- [x] 安全修复（配置集中管理、路径穿越防护、CORS 环境配置）

---

## 💾 数据库说明

### 添加新数据模型

当需要添加新的数据模型（表）时，请按以下步骤操作：

**步骤 1**: 创建模型文件

在 `app/models/` 目录下创建新的模型文件，例如 `app/models/article.py`：

```python
# app/models/article.py

from app.database import Base
from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime, timezone

class Article(Base):
    """文章数据模型"""
    
    __tablename__ = "articles"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    content = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
```

**步骤 2**: 在 `app/models/__init__.py` 中注册

编辑 `app/models/__init__.py`，添加新模型的导入：

```python
from app.models.user import User
from app.models.exercise import Exercise, ExerciseRecord
from app.models.article import Article  # 新增这一行

__all__ = ["User", "Exercise", "ExerciseRecord", "Article"] # 添加
```

**步骤 3**: 初始化数据库表

运行以下命令创建新表：

```bash
python -m scripts.init_db
```

**步骤 4**: （可选）添加测试数据

如果需要初始数据，编辑 `scripts/seed_data.py` 添加种子数据。

---

### 注意事项

1. **必须注册模型**: 新模型必须在 `app/models/__init__.py` 中导入，否则表不会被创建
2. **继承 Base 类**: 所有模型必须继承 `Base` 类
3. **定义 `__tablename__`**: 每个模型必须定义 `__tablename__` 属性
4. **外键关系**: 如果有外键关系，使用 SQLAlchemy 的 `ForeignKey` 和 `relationship`

---

## 📎 附录

### 关键命令
```bash
# 生成安全密钥
python -c "import secrets; print(secrets.token_hex(32))"

# 数据库连接测试
python -m scripts.test_db

# 初始化数据库
python -m scripts.init_db

# 添加测试数据
python -m scripts.seed_data
```

---

**文档维护**: 请在每次重大更新后同步更新此文档

