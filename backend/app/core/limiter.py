from slowapi import Limiter
from fastapi import Request


def get_real_client_ip(request: Request) -> str:
    """Extract the real client IP behind a reverse proxy.

    Nginx sets X-Forwarded-For; without it, fall back to the direct
    connection address.  Only the *first* entry is trusted (the client's
    IP as seen by the outermost proxy).
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=get_real_client_ip)
