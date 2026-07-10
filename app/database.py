# E:\Fitness-ai-backend\app\database.py

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

# 数据库连接 URL
# 格式：postgresql://用户名：密码@主机：端口/数据库名
DATABASE_URL = settings.DATABASE_URL

# 创建引擎
engine = create_engine(DATABASE_URL)


def enable_sqlite_foreign_keys(target_engine: Engine) -> None:
    """Enable SQLite foreign-key actions so local and test behavior matches PostgreSQL."""
    if target_engine.dialect.name != "sqlite":
        return

    @event.listens_for(target_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


enable_sqlite_foreign_keys(engine)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建基类（用于定义数据模型）
Base = declarative_base()


# 获取数据库会话的依赖函数（供 API 接口使用）
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
