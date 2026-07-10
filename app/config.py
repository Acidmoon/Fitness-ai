# E:\Fitness-ai-backend\app\config.py

import re

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

ACCEPTED_ENVIRONMENTS = {"development", "test", "staging", "production"}
PLACEHOLDER_DATABASE_URLS = {
    "postgresql://user:password@localhost:5432/fitness_ai",
    "postgresql://username:password@localhost:5432/fitness_ai",
    "postgresql://<username>:<password>@<host>:5432/<database>",
}
PLACEHOLDER_SECRET_KEYS = {
    "CHANGE_ME",
    "CHANGE_ME_TO_A_REAL_SECRET_KEY",
    "fitness_secret",
    "your-secret-key-change-in-production",
    "your-random-secret-key-here-use-openssl-rand-hex-32",
    "<generate-with-python-secrets-token-hex-32>",
}


class Settings(BaseSettings):
    # 运行环境
    ENVIRONMENT: str = "development"

    # 数据库
    DATABASE_URL: str

    # JWT 配置
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    LOGIN_RATE_LIMIT_MAX_FAILURES: int = 5
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 300

    # 姿态分析后端选择
    POSE_ANALYSIS_BACKEND: str = "movenet"

    # 姿态分析通用配置
    POSE_ANALYSIS_SAMPLE_FPS: int = 5

    # MoveNet 姿态分析配置（默认关闭，避免缺少 native 推理依赖时影响启动）
    MOVENET_ENABLED: bool = False
    MOVENET_MODEL_PATH: str = ""
    MOVENET_MODEL_VARIANT: str = "thunder"
    MOVENET_MIN_CONFIDENCE: float = 0.3
    MOVENET_SAMPLE_FPS: int = 5

    # CORS 配置
    ALLOWED_ORIGINS: str = (
        "http://localhost:3000,http://localhost:5173,http://localhost:8080"
    )

    # 视频存储配置
    VIDEO_STORAGE_BACKEND: str = "local"
    VIDEO_UPLOAD_DIR: str = "uploads/videos"

    # 日志配置
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "logs/app.log"
    LOG_ROTATION: str = "10 MB"
    LOG_RETENTION: str = "7 days"
    LOG_FORMAT: str = "text"

    model_config = SettingsConfigDict(env_file=".env")

    @field_validator("ENVIRONMENT")
    @classmethod
    def validate_environment(cls, value: str) -> str:
        environment = value.strip().lower()
        if environment not in ACCEPTED_ENVIRONMENTS:
            accepted = "、".join(sorted(ACCEPTED_ENVIRONMENTS))
            raise ValueError(f"ENVIRONMENT 必须是以下值之一：{accepted}")
        return environment

    @field_validator("POSE_ANALYSIS_BACKEND")
    @classmethod
    def validate_pose_analysis_backend(cls, value: str) -> str:
        backend_id = value.strip()
        if not backend_id:
            return "movenet"
        if not re.match(r"^[a-z0-9][a-z0-9_-]*$", backend_id):
            raise ValueError(
                "POSE_ANALYSIS_BACKEND must contain only lowercase "
                "alphanumeric characters, hyphens, and underscores, "
                "and must start with a lowercase letter or digit"
            )
        return backend_id

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        database_url = value.strip()
        if not database_url or database_url in PLACEHOLDER_DATABASE_URLS:
            raise ValueError("DATABASE_URL 必须设置为有效的数据库连接字符串")
        return database_url

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        secret_key = value.strip()
        if not secret_key or secret_key in PLACEHOLDER_SECRET_KEYS:
            raise ValueError("SECRET_KEY 必须设置为安全的非默认值")
        return secret_key

    @field_validator("LOGIN_RATE_LIMIT_MAX_FAILURES", "LOGIN_RATE_LIMIT_WINDOW_SECONDS")
    @classmethod
    def validate_positive_int(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("登录限流配置必须为正整数")
        return value

    @field_validator("MOVENET_MODEL_VARIANT")
    @classmethod
    def validate_movenet_model_variant(cls, value: str) -> str:
        model_variant = value.strip().lower()
        if model_variant not in {"lightning", "thunder", "custom"}:
            raise ValueError(
                "MOVENET_MODEL_VARIANT 必须是 lightning、thunder 或 custom"
            )
        return model_variant

    @field_validator("MOVENET_MIN_CONFIDENCE")
    @classmethod
    def validate_movenet_min_confidence(cls, value: float) -> float:
        if value < 0 or value > 1:
            raise ValueError("MOVENET_MIN_CONFIDENCE 必须在 0 到 1 之间")
        return value

    @field_validator("MOVENET_SAMPLE_FPS", "POSE_ANALYSIS_SAMPLE_FPS")
    @classmethod
    def validate_sample_fps(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("采样帧率必须为正整数")
        return value

    @field_validator("VIDEO_STORAGE_BACKEND")
    @classmethod
    def validate_video_storage_backend(cls, value: str) -> str:
        storage_backend = value.strip().lower()
        if storage_backend != "local":
            raise ValueError("VIDEO_STORAGE_BACKEND 当前仅支持 local")
        return storage_backend

    @model_validator(mode="after")
    def validate_production_credentials(self):
        if self.ENVIRONMENT != "production":
            return self

        database_url = self.DATABASE_URL.lower()
        if "change_me" in database_url or ":fitness_secret@" in database_url:
            raise ValueError("生产环境 DATABASE_URL 不能使用示例密码")
        if len(self.SECRET_KEY) < 32:
            raise ValueError("生产环境 SECRET_KEY 长度不能少于 32 个字符")
        return self

    @property
    def allowed_origins_list(self) -> List[str]:
        """将逗号分隔的字符串转换为列表"""
        return [
            origin.strip()
            for origin in self.ALLOWED_ORIGINS.split(",")
            if origin.strip()
        ]


settings = Settings()
