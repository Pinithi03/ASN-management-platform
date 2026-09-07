"""
Confidence Scoring Service.

Computes a weighted composite confidence score:
    - Parser match quality:   30%
    - Field completeness:     25%
    - Format validity:        20%
    - Cross-reference match:  15%
    - Historical accuracy:    10%

Thresholds:
    - >= 0.85 → Auto-commit (no human review)
    - 0.60 - 0.84 → Human review queue
    - < 0.60 → Reject / manual entry required

Called by: parsing_tasks
"""

# TODO: Sprint 4 (EP-05) — Implement scoring algorithm
