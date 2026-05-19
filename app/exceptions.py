"""Unified exception handling and error response model."""

from typing import Optional

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import BaseModel


# ─── Standard Error Response Schema ───────────────────────────────────────────


class ErrorResponse(BaseModel):
    """统一错误响应格式。

    所有异常处理器都输出此结构，方便客户端统一解析。
    """

    code: str  # 机器可读的错误码，如 "RECORD_NOT_FOUND"
    detail: str  # 人类可读的描述
    field: Optional[str] = None  # 可选，指向具体字段（校验错误时使用）


# ─── Application Exceptions ───────────────────────────────────────────────────


class BusinessException(Exception):
    """业务异常 - 用户可理解的错误"""

    def __init__(
        self,
        message: str,
        status_code: int = 400,
        code: str = "BUSINESS_ERROR",
    ):
        self.message = message
        self.status_code = status_code
        self.code = code
        super().__init__(self.message)


class SystemException(Exception):
    """系统异常 - 需要告警的错误"""

    def __init__(self, message: str, code: str = "SYSTEM_ERROR"):
        self.message = message
        self.code = code
        super().__init__(self.message)


# ─── Exception Handlers ───────────────────────────────────────────────────────


async def business_exception_handler(request: Request, exc: BusinessException):
    """业务异常处理器"""
    logger.warning(
        f"Business error: {exc.message} - Path: {request.url.path}",
        extra={"event": "error.business", "path": str(request.url.path)},
    )

    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(code=exc.code, detail=exc.message).model_dump(
            exclude_none=True
        ),
    )


async def system_exception_handler(request: Request, exc: SystemException):
    """系统异常处理器"""
    logger.error(
        f"System error: {exc.message} - Path: {request.url.path}",
        extra={"event": "error.system", "path": str(request.url.path)},
        exc_info=True,
    )

    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            code=exc.code, detail="服务器内部错误"
        ).model_dump(exclude_none=True),
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
):
    """请求校验异常处理器 - 统一 Pydantic 校验错误格式"""
    errors = exc.errors()
    first_error = errors[0] if errors else {}
    field_loc = " -> ".join(str(loc) for loc in first_error.get("loc", []))
    detail = first_error.get("msg", "请求参数校验失败")

    return JSONResponse(
        status_code=422,
        content=ErrorResponse(
            code="VALIDATION_ERROR",
            detail=detail,
            field=field_loc or None,
        ).model_dump(exclude_none=True),
    )


async def general_exception_handler(request: Request, exc: Exception):
    """通用异常处理器（捕获所有未处理的异常）"""
    logger.error(
        f"Unhandled error: {str(exc)} - Path: {request.url.path}",
        extra={"event": "error.unhandled", "path": str(request.url.path)},
        exc_info=True,
    )

    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            code="INTERNAL_ERROR", detail="服务器内部错误"
        ).model_dump(exclude_none=True),
    )


# ─── Registration ─────────────────────────────────────────────────────────────


def register_exception_handlers(app):
    """注册所有异常处理器到 FastAPI 应用"""
    app.add_exception_handler(BusinessException, business_exception_handler)
    app.add_exception_handler(SystemException, system_exception_handler)
    app.add_exception_handler(
        RequestValidationError, validation_exception_handler
    )
    app.add_exception_handler(Exception, general_exception_handler)


__all__ = [
    "BusinessException",
    "ErrorResponse",
    "SystemException",
    "register_exception_handlers",
]
