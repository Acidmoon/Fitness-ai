# E:\Fitness-ai-backend\app\config.py

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

PLACEHOLDER_DATABASE_URLS = {
    "postgresql://user:password@localhost:5432/fitness_ai",
}
PLACEHOLDER_SECRET_KEYS = {
    "your-secret-key-change-in-production",
}


class Settings(BaseSettings):
    # 数据库
    DATABASE_URL: str

    # JWT 配置
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    LOGIN_RATE_LIMIT_MAX_FAILURES: int = 5
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 300

    # MoveNet 姿态分析配置（默认关闭，避免缺少 native 推理依赖时影响启动）
    MOVENET_ENABLED: bool = False
    MOVENET_MODEL_PATH: str = ""
    MOVENET_MODEL_VARIANT: str = "thunder"
    MOVENET_MIN_CONFIDENCE: float = 0.3
    MOVENET_SAMPLE_FPS: int = 5

    # CORS 配置
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:8080"

    # 日志配置
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "logs/app.log"
    LOG_ROTATION: str = "10 MB"
    LOG_RETENTION: str = "7 days"
    LOG_FORMAT: str = "text"

    model_config = SettingsConfigDict(env_file=".env")

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

    @field_validator("MOVENET_SAMPLE_FPS")
    @classmethod
    def validate_movenet_sample_fps(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("MOVENET_SAMPLE_FPS 必须为正整数")
        return value

    @property
    def allowed_origins_list(self) -> List[str]:
        """将逗号分隔的字符串转换为列表"""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]


settings = Settings()
