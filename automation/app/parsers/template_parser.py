"""
Template-Based Parser (Tier 1 — MVP).

Parses emails using exact format templates defined per client/sender.
Highest confidence when matched (0.90-0.99).

Template format: Named placeholders mapping to email body sections.
Templates stored in DB and loaded at worker startup.
"""

# TODO: Sprint 4 (EP-05) — Implement template parser
