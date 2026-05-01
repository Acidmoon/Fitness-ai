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

    @property
    def allowed_origins_list(self) -> List[str]:
        """将逗号分隔的字符串转换为列表"""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]


settings = Settings()
