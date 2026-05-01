from datetime import date, datetime, time, timezone

UTC = timezone.utc


def utc_now() -> datetime:
    """返回用于数据库持久化的标准 UTC 时间。"""
    # 使用 naive UTC 以兼容 SQLite，同时确保所有默认值和查询边界
    # 都基于同一时区语义。
    return datetime.now(UTC).replace(tzinfo=None)


def normalize_utc_datetime(value: datetime) -> datetime:
    """将 aware datetime 规范化为数据库兼容的 naive UTC。"""
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def utc_day_bounds(day: date) -> tuple[datetime, datetime]:
    """返回某一自然日对应的 UTC 起止边界。"""
    start = datetime.combine(day, time.min, tzinfo=UTC)
    end = datetime.combine(day, time.max, tzinfo=UTC)
    return normalize_utc_datetime(start), normalize_utc_datetime(end)
