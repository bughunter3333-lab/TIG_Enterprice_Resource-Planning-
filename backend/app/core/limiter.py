from slowapi import Limiter
from fastapi import Request


def get_real_client_ip(request: Request) -> str:
    """The client IP to key rate limits on, behind one trusted proxy.

    X-Forwarded-For grows left to right: each hop appends the peer it saw, so
    the header reads `what the client claimed, what hop 1 saw, what hop 2 saw`.
    The *leftmost* entry is therefore the one value in the header that the
    client wrote itself, and keying a rate limit on it means an attacker gets a
    fresh bucket per request just by varying a header — the limit stops
    existing. This function used to take exactly that entry, and said so in its
    own docstring.

    With a single trusted proxy in front, the rightmost entry is the peer that
    proxy actually saw, which is the closest thing to the truth available here.

    That assumption is worth confirming against the deployment rather than
    trusting: send a request carrying a junk X-Forwarded-For and check which
    value arrives last. If the platform replaces the header instead of
    appending, leftmost and rightmost are the same value and this is still
    correct; if it adds more than one hop, count from the right.

    IP is a weak key regardless — staff reach the API through one Vercel
    rewrite and share an egress address, so tightening the limit throttles the
    whole team together. The control that actually holds is the per-account
    lockout, which does not depend on this at all.
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        hops = [hop.strip() for hop in forwarded_for.split(",") if hop.strip()]
        if hops:
            return hops[-1]
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=get_real_client_ip)
