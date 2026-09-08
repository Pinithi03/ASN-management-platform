-- ============================================================
-- ANS Management Platform — PostgreSQL Init Script
-- ============================================================
-- Run once when the database container is first created.
-- Creates required extensions and the updated_at trigger function.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";      -- case-insensitive text

-- Trigger function for auto-updating updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RLS Configuration Variables
-- ============================================================
-- The application sets these per-connection via SET LOCAL:
--   app.current_company_id  — UUID of the user's company
--   app.current_role        — 'COMPANY_ADMIN' or 'SUPPLIER'
--   app.current_supplier_id — UUID of supplier (SUPPLIER only)
--
-- These are used by RLS policies defined in the Alembic
-- migrations to enforce tenant isolation at the DB level.
-- ============================================================

-- Create a dedicated application role for the backend
-- (the main ans_user role is created by POSTGRES_USER env var)
DO $$
BEGIN
    -- Ensure the application user exists (created by Docker)
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = current_user) THEN
        -- Allow the app user to set custom GUC variables
        EXECUTE format(
            'ALTER ROLE %I SET app.current_company_id TO ''''',
            current_user
        );
        EXECUTE format(
            'ALTER ROLE %I SET app.current_role TO ''''',
            current_user
        );
        EXECUTE format(
            'ALTER ROLE %I SET app.current_supplier_id TO ''''',
            current_user
        );
    END IF;
END $$;
