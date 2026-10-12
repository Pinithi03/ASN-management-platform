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

check_tcp_or_docker() {
    local name=$1
    local host=$2
    local port=$3
    local cmd=$4
    if eval "$cmd" > /dev/null 2>&1 || nc -z "$host" "$port" > /dev/null 2>&1; then
        echo "  ✅ $name"
    else
        echo "  ❌ $name (unreachable at $host:$port)"
    fi
}

check_service "Backend API"        "http://localhost:8000/api/v1/health"
check_service "Frontend"           "http://localhost:3000"
check_tcp_or_docker "PostgreSQL"   "localhost" "5432" "docker compose exec -T postgres pg_isready -q"
check_tcp_or_docker "Redis"        "localhost" "6379" "docker compose exec -T redis redis-cli ping"
check_service "RabbitMQ"           "http://localhost:15672"
check_service "MinIO"              "http://localhost:9000/minio/health/live"
check_service "Keycloak"           "http://localhost:8080/auth"
check_service "Flower"             "http://localhost:5555"
check_service "Nginx"              "http://localhost:80/nginx-health"

echo ""
echo "Done."
