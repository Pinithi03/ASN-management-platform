#!/usr/bin/env bash
# ============================================================
# Health check all services
# ============================================================
set -euo pipefail

echo "🏥 Checking service health..."
echo ""

check_service() {
    local name=$1
    local url=$2
    if curl -sf "$url" > /dev/null 2>&1; then
        echo "  ✅ $name"
    else
        echo "  ❌ $name (unreachable at $url)"
    fi
}

check_service "Backend API"        "http://localhost:8000/api/v1/health"
check_service "Frontend"           "http://localhost:3000"
check_service "PostgreSQL"         "http://localhost:5432"
check_service "Redis"              "http://localhost:6379"
check_service "RabbitMQ"           "http://localhost:15672"
check_service "MinIO"              "http://localhost:9000/minio/health/live"
check_service "Keycloak"           "http://localhost:8080/health"
check_service "Flower"             "http://localhost:5555"
check_service "Nginx"              "http://localhost:80/nginx-health"

echo ""
echo "Done."
