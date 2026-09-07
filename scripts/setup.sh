#!/usr/bin/env bash
# ============================================================
# Initial development environment setup
# Run once after cloning the repository
# ============================================================
set -euo pipefail

echo "🚀 Setting up ANS Management Platform development environment..."

# Check prerequisites
echo "📋 Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required. Install: https://docs.docker.com/get-docker/"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo "❌ Docker Compose v2 is required."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ Python 3.12+ is required."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js 20+ is required."; exit 1; }

# Copy environment file
if [ ! -f .env ]; then
    echo "📄 Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Edit .env with your actual credentials before running services."
fi

# Install backend dependencies
echo "🐍 Installing backend dependencies..."
cd backend && pip install -e ".[dev]" && cd ..

# Install automation dependencies
echo "⚙️  Installing automation dependencies..."
cd automation && pip install -e ".[dev]" && cd ..

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend && npm install && cd ..

# Start infrastructure services
echo "🐳 Starting Docker services..."
cd docker && docker compose up -d postgres redis rabbitmq minio keycloak && cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your credentials"
echo "  2. make backend-dev    — Start backend (port 8000)"
echo "  3. make frontend-dev   — Start frontend (port 3000)"
echo "  4. make worker-start   — Start Celery worker"
echo ""
echo "Service UIs:"
echo "  • RabbitMQ Management: http://localhost:15672"
echo "  • MinIO Console:       http://localhost:9001"
echo "  • Keycloak Admin:      http://localhost:8080"
echo "  • Flower (workers):    http://localhost:5555"
