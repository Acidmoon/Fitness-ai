"""Backward-compatible re-exports from app.auth submodule.

All authentication logic now lives in app.auth/. This module re-exports
the public API so existing imports continue to work without modification.
"""

from app.auth.dependencies import get_current_user, oauth2_scheme  # noqa: F401
from app.auth.jwt import (  # noqa: F401
    JWT_SUB_TYPE_REFRESH,
    JWT_SUB_TYPE_USER_ID,
    create_access_token,
    create_refresh_token,
    decode_access_token,
)
from app.auth.password import hash_password, verify_password  # noqa: F401

__all__ = [
    "JWT_SUB_TYPE_REFRESH",
    "JWT_SUB_TYPE_USER_ID",
    "create_access_token",
    "create_refresh_token",
    "decode_access_token",
    "get_current_user",
    "hash_password",
    "oauth2_scheme",
    "verify_password",
]
