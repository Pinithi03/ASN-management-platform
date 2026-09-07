"""
Base Parser Interface.

All parsers implement:
    - can_parse(email) -> bool  — check if this parser handles the format
    - parse(email) -> ParseResult — extract PO data from email body
    - confidence() -> float — parser's self-reported confidence

ParseResult dataclass:
    - po_number, client_code, quantities, dates, etc.
    - per_field_confidence: dict[str, float]
    - parser_name: str
    - raw_extracted: dict (original extracted data before normalization)
"""

# TODO: Sprint 4 (EP-05) — Implement base parser
# from abc import ABC, abstractmethod
# from dataclasses import dataclass
