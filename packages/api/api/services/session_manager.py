"""
AI session message trimming.

Keeps conversation history within Claude's context window by summarising
old messages when the session grows too long.
"""
from __future__ import annotations

import structlog

log = structlog.get_logger()

MAX_MESSAGES    = 20   # hard cap on stored messages
SUMMARY_THRESHOLD = 16  # trigger summarisation at this count


def _estimate_tokens(messages: list[dict]) -> int:
    """Heuristic: count words × 1.3. Good enough for logging; not billing."""
    total_words = 0
    for m in messages:
        content = m.get("content", "")
        if isinstance(content, str):
            total_words += len(content.split())
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    total_words += len(block.get("text", "").split())
    return int(total_words * 1.3)


async def trim_session(messages: list[dict], client) -> tuple[list[dict], int]:
    """
    If messages exceed SUMMARY_THRESHOLD, summarise the oldest messages
    and return a trimmed list.

    Returns (trimmed_messages, estimated_tokens).
    Keeps last 6 messages verbatim; summarises everything before that.
    """
    estimated = _estimate_tokens(messages)
    log.info("ai.session.tokens", estimated=estimated, message_count=len(messages))

    if len(messages) <= SUMMARY_THRESHOLD:
        return messages, estimated

    keep_tail = 6
    to_summarise = messages[:-keep_tail]
    tail = messages[-keep_tail:]

    # Build summary prompt
    history_text = "\n".join(
        f"{m['role'].upper()}: {m['content'] if isinstance(m['content'], str) else '[tool/image content]'}"
        for m in to_summarise
    )
    summary_prompt = (
        "Summarise the following conversation history into one concise paragraph "
        "that captures the key facts, preferences, and decisions relevant to "
        "future nutritional advice. Be specific about numbers and goals mentioned.\n\n"
        + history_text
    )

    try:
        resp = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": summary_prompt}],
        )
        summary_text = resp.content[0].text.strip()
        log.info("ai.session.summarised", kept=keep_tail, summarised=len(to_summarise))
    except Exception as exc:
        log.warning("ai.session.summary_failed", exc=str(exc))
        # Fallback: just keep last MAX_MESSAGES messages
        return messages[-MAX_MESSAGES:], estimated

    summary_message = {
        "role": "user",
        "content": f"[Session context — earlier conversation summary]: {summary_text}",
    }
    trimmed = [summary_message] + tail
    return trimmed, _estimate_tokens(trimmed)
