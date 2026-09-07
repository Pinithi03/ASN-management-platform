# ============================================================
# ANS Management Platform — Makefile
# ============================================================
# Usage: make <target>
# Run `make help` to see all available targets.
# ============================================================

.DEFAULT_GOAL := help
.PHONY: help setup backend-install backend-dev backend-test backend-lint \
        frontend-install frontend-dev frontend-build frontend-test frontend-lint \
        worker-start beat-start flower-start \
        docker-up docker-down docker-logs docker-build infra-up \
        db-migrate db-upgrade db-downgrade db-seed \
        test lint clean healthcheck

# ── Colors ──────────────────────────────────────────────────
BLUE  := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RESET := \033[0m

# ── Help ────────────────────────────────────────────────────
help: ## Show this help message
	@echo ""
	@echo "$(BLUE)ANS Management Platform$(RESET) — Development Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# ── Setup ───────────────────────────────────────────────────
setup: ## First-time setup (install all dependencies)
	@./scripts/setup.sh

# ── Backend (System A) ─────────────────────────────────────
backend-install: ## Install backend Python dependencies
	cd backend && pip install -e ".[dev]"

backend-dev: ## Run backend dev server (port 8000)
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

backend-test: ## Run backend tests
	cd backend && pytest tests/ -v --tb=short

backend-lint: ## Lint + type-check backend code
	cd backend && ruff check app/ tests/ && ruff format --check app/ tests/ && mypy app/

# ── Frontend ────────────────────────────────────────────────
frontend-install: ## Install frontend npm dependencies
	cd frontend && npm install

frontend-dev: ## Run frontend dev server (port 3000)
	cd frontend && npm run dev

frontend-build: ## Build frontend for production
	cd frontend && npm run build

frontend-test: ## Run frontend tests
	cd frontend && npm test

frontend-lint: ## Lint frontend code
	cd frontend && npm run lint

# ── Automation (System B) ──────────────────────────────────
worker-start: ## Start Celery worker
	cd automation && celery -A app.celery_app:celery_app worker --loglevel=info -Q email.ingestion,email.processing,email.persistence

beat-start: ## Start Celery Beat scheduler
	cd automation && celery -A app.celery_app:celery_app beat --loglevel=info

flower-start: ## Start Flower monitoring UI (port 5555)
	cd automation && celery -A app.celery_app:celery_app flower --port=5555

# ── Docker ──────────────────────────────────────────────────
docker-up: ## Start all services via Docker Compose
	cd docker && docker compose up -d

docker-down: ## Stop all Docker services
	cd docker && docker compose down

docker-logs: ## Tail Docker service logs
	cd docker && docker compose logs -f

docker-build: ## Rebuild all Docker images
	cd docker && docker compose build --no-cache

infra-up: ## Start only infrastructure (DB, Redis, RabbitMQ, MinIO, Keycloak)
	cd docker && docker compose up -d postgres redis rabbitmq minio keycloak

# ── Database ────────────────────────────────────────────────
db-migrate: ## Create new Alembic migration (MSG="description")
	cd backend && alembic revision --autogenerate -m "$(MSG)"

db-upgrade: ## Apply all pending migrations
	cd backend && alembic upgrade head

db-downgrade: ## Rollback one migration
	cd backend && alembic downgrade -1

db-seed: ## Seed database with initial data
	python scripts/seed.py

# ── Combined ────────────────────────────────────────────────
test: backend-test frontend-test ## Run all tests

lint: backend-lint frontend-lint ## Run all linters

healthcheck: ## Check health of all services
	@./scripts/healthcheck.sh

clean: ## Remove build artifacts, caches, and temp files
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/dist backend/dist automation/dist
	@echo "$(GREEN)Cleaned.$(RESET)"
