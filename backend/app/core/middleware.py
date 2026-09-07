"""
FastAPI middleware stack.

Includes:
    - RequestIDMiddleware — adds X-Request-ID to every request
    - CompanyContextMiddleware — extracts company_id from JWT
    - RateLimitMiddleware — per-company rate limiting
    - LoggingMiddleware — structured request/response logging
    - CORSMiddleware configuration
"""

# TODO: Sprint 1-2 — Implement middleware
