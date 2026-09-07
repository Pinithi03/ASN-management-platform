"""
Shared contracts between System A (Backend) and System B (Automation).

Contains constants, enums, event schemas, and data contracts that
both systems must agree on. Changes here affect both systems.

Usage (from either backend/ or automation/):
    from packages.shared.enums import CompanyCode, EmailStatus
    from packages.shared.events import EmailProcessedEvent
"""
