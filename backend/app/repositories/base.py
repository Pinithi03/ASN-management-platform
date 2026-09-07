"""
Base Repository — abstract foundation for all repositories.

Provides:
    - Generic CRUD operations (create, get, get_multi, update, delete)
    - Multi-tenant filtering (automatic company_id scoping)
    - Pagination helpers
    - Transaction management patterns

All concrete repositories inherit from BaseRepository[ModelType].
"""

# TODO: Sprint 1 (EP-01) — Implement generic base repository
# class BaseRepository(Generic[ModelType]):
#     def __init__(self, model: Type[ModelType], session: AsyncSession): ...
#     async def get(self, id: UUID, company_id: UUID) -> ModelType | None: ...
#     async def get_multi(self, company_id: UUID, skip: int, limit: int) -> list[ModelType]: ...
#     async def create(self, obj_in: dict) -> ModelType: ...
#     async def update(self, id: UUID, obj_in: dict) -> ModelType: ...
#     async def soft_delete(self, id: UUID) -> bool: ...
