"""
Po Repository (Data Access Layer).

Encapsulates all database queries for the po domain.
Returns SQLAlchemy model instances — never raw rows.

Rules:
    - All queries MUST include company_id for tenant isolation
    - Use async session for non-blocking I/O
    - Return Optional/List types, never raise on "not found"
"""

# TODO: Implement in appropriate sprint
# from app.repositories.base import BaseRepository
# from app.models.po import Po
#
# class PoRepository(BaseRepository[Po]):
#     ...
