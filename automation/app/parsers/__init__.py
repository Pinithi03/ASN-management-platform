"""
Email parser implementations.

3-tier parsing strategy:
    - Tier 1 (MVP): Template-based parsers (exact format matching)
    - Tier 2: Regex-based parsers (pattern matching fallback)
    - Tier 3 (Phase 4): AI/LLM parser via Ollama (future)

Each parser implements the BaseParser interface and returns
a ParseResult with extracted fields + confidence scores.
"""
