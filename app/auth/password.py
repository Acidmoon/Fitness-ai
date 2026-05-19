"""Password hashing and verification using bcrypt."""

import bcrypt


def hash_password(password: str) -> str:
    """对密码进行 bcrypt 加密（12 rounds）。"""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证明文密码是否与哈希匹配。"""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )
