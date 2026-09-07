"""
Pydantic v2 schemas (DTOs).

Schemas define request/response shapes for the API layer.
Naming convention:
    - {Entity}Create  — POST request body
    - {Entity}Update  — PATCH request body
    - {Entity}Response — API response
    - {Entity}InDB     — Full DB representation (internal)
"""
