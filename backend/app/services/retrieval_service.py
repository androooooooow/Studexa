import re
from typing import List, Optional
import aiosqlite


STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
    "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was",
    "what", "when", "where", "which", "who", "why", "with", "about", "can",
    "explain", "tell", "me", "please", "does", "do",
}


def build_fts5_query(raw_query: str) -> str:
    """
    Sanitize user query text into a safe SQLite FTS5 query string using OR-joined tokens.
    Prevents FTS5 syntax errors from punctuation or operators in student questions.
    """
    tokens = re.findall(r"[A-Za-z0-9]{2,}", (raw_query or "").lower())
    filtered = [t for t in tokens if t not in STOPWORDS][:12]
    if not filtered:
        filtered = tokens[:8]
    if not filtered:
        return ""
    return " OR ".join(f'"{token}"' for token in filtered)


async def retrieve_relevant_chunks(
    db: aiosqlite.Connection,
    session_id: str,
    document_id: Optional[str],
    query: str = "",
    limit: int = 6,
) -> List[dict]:
    """
    Search document_chunks_fts using SQLite FTS5 BM25 ranking scoped strictly to session_id & document_id.
    Falls back to the first N sequential chunks if query is empty or has no keyword hits.
    Returns [] immediately if document_id is None or empty (Standalone Mode).
    """
    clean_doc_id = (document_id or "").strip()
    if not clean_doc_id:
        return []

    fts_query = build_fts5_query(query)
    if fts_query:
        cursor = await db.execute(
            """
            SELECT
                c.chunk_index,
                c.chunk_text,
                bm25(document_chunks_fts) AS rank_score
            FROM document_chunks_fts
            JOIN document_chunks c ON c.id = document_chunks_fts.rowid
            WHERE document_chunks_fts MATCH ?
              AND c.session_id = ?
              AND c.document_id = ?
            ORDER BY rank_score ASC, c.chunk_index ASC
            LIMIT ?
            """,
            (fts_query, session_id, clean_doc_id, limit),
        )
        rows = await cursor.fetchall()
        if rows:
            return [
                {"chunk_index": row["chunk_index"], "chunk_text": row["chunk_text"]}
                for row in rows
            ]

    # Fallback: retrieve sequential chunks for the document
    fallback_cursor = await db.execute(
        """
        SELECT chunk_index, chunk_text
        FROM document_chunks
        WHERE session_id = ? AND document_id = ?
        ORDER BY chunk_index ASC
        LIMIT ?
        """,
        (session_id, clean_doc_id, limit),
    )
    fallback_rows = await fallback_cursor.fetchall()
    return [
        {"chunk_index": row["chunk_index"], "chunk_text": row["chunk_text"]}
        for row in fallback_rows
    ]
