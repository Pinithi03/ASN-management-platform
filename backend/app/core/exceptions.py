"""
Custom exception classes and exception handlers.
"""

from typing import Any
from fastapi import Request, status
from fastapi.responses import JSONResponse


class AppException(Exception):
    """Base application exception."""
    def __init__(
        self,
        message: str = "An error occurred",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail: Any = None,
    ):
        self.message = message
        self.status_code = status_code
        self.detail = detail
        super().__init__(self.message)


class NotFoundError(AppException):
    def __init__(self, resource: str = "Resource", resource_id: Any = None):
        message = f"{resource} not found"
        if resource_id:
            message = f"{resource} with id '{resource_id}' not found"
        super().__init__(message=message, status_code=status.HTTP_404_NOT_FOUND)


class ConflictError(AppException):
    def __init__(self, message: str = "Resource already exists"):
        super().__init__(message=message, status_code=status.HTTP_409_CONFLICT)


class ForbiddenError(AppException):
    def __init__(self, message: str = "Access denied"):
        super().__init__(message=message, status_code=status.HTTP_403_FORBIDDEN)


class BadRequestError(AppException):
    def __init__(self, message: str = "Bad request", detail: Any = None):
        super().__init__(
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Global handler for AppException and subclasses."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "message": exc.message,
                "detail": exc.detail,
                "type": type(exc).__name__,
            }
        },
    )
