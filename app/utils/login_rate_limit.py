import threading
import time
from fastapi import Request

from app.config import settings


class LoginFailureLimiter:
    def __init__(self):
        self._attempts: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _window_seconds(self) -> int:
        return settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS

    def _max_failures(self) -> int:
        return settings.LOGIN_RATE_LIMIT_MAX_FAILURES

    def _prune_attempts(self, scope: str, now: float) -> list[float]:
        attempts = self._attempts.get(scope, [])
        window_start = now - self._window_seconds()
        pruned_attempts = [attempt for attempt in attempts if attempt > window_start]
        if pruned_attempts:
            self._attempts[scope] = pruned_attempts
        else:
            self._attempts.pop(scope, None)
        return pruned_attempts

    def is_limited(self, scope: str) -> bool:
        now = time.time()
        with self._lock:
            attempts = self._prune_attempts(scope, now)
            return len(attempts) >= self._max_failures()

    def register_failure(self, scope: str) -> None:
        now = time.time()
        with self._lock:
            attempts = self._prune_attempts(scope, now)
            attempts.append(now)
            self._attempts[scope] = attempts

    def clear_scope(self, scope: str) -> None:
        with self._lock:
            self._attempts.pop(scope, None)

    def clear_all(self) -> None:
        with self._lock:
            self._attempts.clear()


login_failure_limiter = LoginFailureLimiter()
registration_limiter = LoginFailureLimiter()


def build_login_rate_limit_scope(request: Request, username: str) -> str:
    client_host = request.client.host if request.client else "unknown"
    normalized_username = username.strip().lower()
    return f"{client_host}:{normalized_username}"


def build_registration_rate_limit_scope(request: Request) -> str:
    """Rate-limit registration attempts per IP."""
    client_host = request.client.host if request.client else "unknown"
    return f"register:{client_host}"


def clear_all_login_rate_limits() -> None:
    login_failure_limiter.clear_all()
