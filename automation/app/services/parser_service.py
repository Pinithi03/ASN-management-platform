"""
Parser Orchestrator Service.

Manages the 3-tier parsing chain:
    1. Try template parser (exact format match) → if match, return
    2. Try regex parser (pattern matching) → if match, return
    3. (Future) Try AI/LLM parser via Ollama → return best guess

Selects parser based on sender domain + email format.
Returns ParseResult with extracted fields and per-field confidence.

Calls: TemplateParser, RegexParser, (future) AIParser
Called by: parsing_tasks
"""

# TODO: Sprint 4 (EP-05) — Implement parser chain
