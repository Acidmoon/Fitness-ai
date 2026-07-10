"""Alembic environment bound to the application's validated database settings."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import settings
from app.database import Base, enable_sqlite_foreign_keys
from app import models  # noqa: F401 - importing registers every model with Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Generate SQL without opening a database connection."""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against the configured database."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    enable_sqlite_foreign_keys(connectable)

    with connectable.connect() as connection:
        is_sqlite = connection.dialect.name == "sqlite"
        # SQLite batch migrations recreate referenced tables. Foreign-key checks must be
        # disabled before Alembic opens its migration transaction, then restored afterwards.
        if is_sqlite:
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
            connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=is_sqlite,
        )

        try:
            with context.begin_transaction():
                context.run_migrations()
            if is_sqlite and connection.in_transaction():
                connection.commit()
        except Exception:
            if connection.in_transaction():
                connection.rollback()
            raise
        finally:
            if is_sqlite:
                connection.exec_driver_sql("PRAGMA foreign_keys=ON")
                connection.commit()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
