"""Security helpers shared across this tool's API.

Three concerns this module addresses:

1. **SSRF** — `assert_public_url` resolves a user-supplied URL's hostname and
   rejects loopback (127/8, ::1), link-local (169.254/16, fe80::/10), private
   RFC1918 ranges (10/8, 172.16/12, 192.168/16), and IPv6 ULA. Otherwise the
   `/api/extract-url` endpoint could be used to read AWS/Render IMDS at
   169.254.169.254 or pivot into the internal network.

2. **Upload bombs** — `read_upload_capped` streams an UploadFile chunk-by-chunk
   and aborts at MAX_UPLOAD_BYTES. The previous `await file.read()` would
   buffer multi-GB POSTs in memory before any size check.

3. **Per-IP rate limiting** — `RateLimiter` is a small in-memory token bucket
   keyed by remote IP, used to gate the generate / extract / auto-fields
   endpoints so a single attacker can't drain the Groq quota in a tight loop.
   For a fleet of workers this would need Redis; for a single Render free-tier
   instance an in-process dict is fine.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
import time
from collections import defaultdict, deque
from typing import Optional
from urllib.parse import urlparse

from fastapi import HTTPException, Request, UploadFile


# ─── 1. SSRF protection ────────────────────────────────────────────────────────

_DENY_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),   # AWS/Render metadata + link-local
    ipaddress.ip_network("100.64.0.0/10"),    # Carrier-grade NAT
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),         # IPv6 ULA
    ipaddress.ip_network("fe80::/10"),        # IPv6 link-local
]


def assert_public_url(url: str) -> str:
    """Validate the URL resolves to a public IP. Raises HTTPException(400) if
    the hostname is missing, the scheme isn't http(s), the host is `localhost`,
    or DNS resolves to any private/loopback/metadata range."""
    if not url or not url.strip():
        raise HTTPException(status_code=400, detail="url is required")
    parsed = urlparse(url if "://" in url else "https://" + url.strip())
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http(s) URLs are allowed")
    host = (parsed.hostname or "").lower()
    if not host:
        raise HTTPException(status_code=400, detail="URL is missing a hostname")
    if host in ("localhost", "metadata.google.internal", "metadata.goog"):
        raise HTTPException(status_code=400, detail="That URL is not allowed")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail=f"Could not resolve hostname: {host}")
    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        for net in _DENY_NETWORKS:
            if ip in net:
                raise HTTPException(status_code=400, detail="That URL is not allowed (private network)")
    return parsed.geturl()


# ─── 2. Upload size cap ────────────────────────────────────────────────────────

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


async def read_upload_capped(file: UploadFile, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    """Read an UploadFile in 64KB chunks; raise 413 if it exceeds max_bytes.

    Prevents a single attacker from buffering a multi-GB POST body in memory
    just by ignoring our docs and sending a huge file.
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(65536)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Max upload is {max_bytes // (1024 * 1024)} MB.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


# ─── 3. Simple per-IP rate limiter (in-memory) ────────────────────────────────

class RateLimiter:
    """Token-bucket-ish per-key rate limiter.

    Each key (typically the client IP) gets a sliding window of `max_calls`
    requests in the last `window_seconds`. Once exhausted, further calls in
    that window raise 429 Too Many Requests. Memory is bounded — at most
    `max_calls` timestamps per active key — and stale keys are pruned lazily.
    """

    def __init__(self, max_calls: int, window_seconds: float):
        self.max_calls = max_calls
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> None:
        async with self._lock:
            now = time.monotonic()
            q = self._hits[key]
            # Drop timestamps outside the sliding window
            while q and (now - q[0]) > self.window:
                q.popleft()
            if len(q) >= self.max_calls:
                retry_after = max(1, int(self.window - (now - q[0])))
                raise HTTPException(
                    status_code=429,
                    detail=f"Too many requests. Try again in {retry_after}s.",
                    headers={"Retry-After": str(retry_after)},
                )
            q.append(now)
            # Lazy GC: if we got too many distinct keys, drop the oldest empties
            if len(self._hits) > 10000:
                for k in list(self._hits.keys()):
                    if not self._hits[k]:
                        del self._hits[k]


def client_ip(request: Request) -> str:
    """Best-effort client IP. On Render the real IP is in X-Forwarded-For."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Module-level limiters used by main.py.
# Generate endpoints (expensive — Groq tokens): 15 / minute / IP
generate_limiter = RateLimiter(max_calls=15, window_seconds=60)
# Lighter endpoints (URL/YouTube extract, auto-fields): 30 / minute / IP
extract_limiter = RateLimiter(max_calls=30, window_seconds=60)
# Uploads: 10 / minute / IP
upload_limiter = RateLimiter(max_calls=10, window_seconds=60)
