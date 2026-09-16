#!/usr/bin/env python3
"""
Database seed script for development.
Executes database seeding inside backend container or locally.

Usage:
    python scripts/seed.py
    # or
    docker compose exec backend python -m app.db.seed
"""

import subprocess
import sys


def main():
    print("🌱 Running database seed...")
    # Try running via docker compose first
    cmd = ["docker", "exec", "ans-backend", "python", "-m", "app.db.seed"]
    result = subprocess.run(cmd)
    if result.returncode == 0:
        print("✅ Database seeding completed successfully!")
    else:
        print("⚠️ Failed to execute in container, trying local python module...")
        cmd_local = [sys.executable, "-m", "app.db.seed"]
        subprocess.run(cmd_local, cwd="backend")


if __name__ == "__main__":
    main()
