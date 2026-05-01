from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.api import ai, auth, exercise, stats, user, video
from app.config import settings
from app.exceptions import register_exception_handlers
from app.logging_config import setup_logging
from app.middleware.logging_middleware import LoggingMiddleware

# 初始化日志系统（控制台 + 文件轮转）
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("🚀 应用启动中...")
    yield
    logger.info("👋 应用关闭中...")


app = FastAPI(
    title="体适能 AI 管家 API",
    description="校园健康体适能检测与管理系统",
    version="1.0.0",
    lifespan=lifespan,
)

# 添加日志中间件
app.add_middleware(LoggingMiddleware)

# 注册异常处理器
register_exception_handlers(app)

# 允许跨域（从环境变量读取配置）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(exercise.router, prefix="/api/exercise", tags=["运动"])
app.include_router(stats.router, prefix="/api/stats", tags=["统计"])
app.include_router(video.router, prefix="/api/video", tags=["视频"])
app.include_router(user.router, prefix="/api/user", tags=["用户"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI"])


@app.get("/")
def root():
    return {"message": "欢迎使用体适能 AI 管家 API", "version": "1.0.0"}


@app.get("/health")
def health_check():
    return {"status": "ok"}
