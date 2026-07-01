# E:\Fitness-ai-backend\app\logging_config.py

import sys
from pathlib import Path
from loguru import logger
from app.config import settings


def setup_logging():
    """配置日志系统"""
    # 移除默认的处理器
    logger.remove()

    # 创建日志目录
    log_file = Path(settings.LOG_FILE)
    log_file.parent.mkdir(exist_ok=True)

    # 根据环境选择日志格式
    if settings.LOG_FORMAT == "json":
        # 生产环境：JSON 格式
        log_format = "{message}"
        serialize_logs = True
    else:
        # 开发环境：文本格式
        log_format = (
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
            "<level>{message}</level>"
        )
        serialize_logs = False

    # 添加控制台处理器
    logger.add(
        sys.stderr,
        format=log_format,
        level=settings.LOG_LEVEL,
        colorize=(settings.LOG_FORMAT != "json"),
        serialize=serialize_logs,
    )

    # 添加文件处理器（带轮转）
    logger.add(
        log_file,
        format=log_format,
        level=settings.LOG_LEVEL,
        rotation=settings.LOG_ROTATION,
        retention=settings.LOG_RETENTION,
        compression="zip",
        encoding="utf-8",
        serialize=serialize_logs,
    )

    logger.info("📝 日志系统初始化完成")
    logger.info(f"日志级别：{settings.LOG_LEVEL}")
    logger.info(f"日志文件：{settings.LOG_FILE}")
    logger.info(f"日志格式：{settings.LOG_FORMAT}")


# 导出 logger 实例
__all__ = ["logger", "setup_logging"]
