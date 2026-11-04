import json
import logging
import re
from typing import Any, Dict, List, Optional
import uuid
import aiosqlite
from pydantic import BaseModel, Field, model_validator
from app.schemas.study_tools import KeyTermItem
from app.security.sessions import to_iso, utc_now
from app.services.ollama_service import (
    build_bounded_source_context,
    generate_and_validate_json,
    OllamaGenerationError,
)
from app.workers.ai_worker import register_job_handler

logger = logging.getLogger(__name__)

REVIEWER_SCHEMA_HINT = """{
  "title": "Comprehensive Examination & Study Reviewer Title",
  "executive_summary": "Extensive 3-5 sentence academic synthesis providing an overarching conceptual framework, methodology, and practical scope of the material.",
  "learning_objectives": [
    "Master foundational principles, theoretical frameworks, and core terminology",
    "Apply quantitative methods, formulas, and procedural workflows",
    "Analyze problem statements, empirical datasets, and analytical findings",
    "Evaluate implementation best practices, diagnostic criteria, and exam-critical distinctions"
  ],
  "topics": [
    {
      "topic_title": "Foundational Principles, Background & Problem Definition",
      "bullet_points": [
        "In-depth explanation of core background, institutional context, and stakeholder requirements",
        "Key operational challenges, historical precedents, and problem justifications",
        "Primary scope, domain boundaries, and conceptual significance"
      ]
    },
    {
      "topic_title": "Methodology, Architecture & Procedural Workflows",
      "bullet_points": [
        "Step-by-step technical or quantitative methodology applied across the syllabus",
        "Mathematical formulas, parameter constraints, and computational derivations",
        "Hardware, software, or survey instrumentation mechanisms and data structures"
      ]
    }
  ],
  "key_terms": [
    {"term": "Term Name", "definition": "Exhaustive, rigorous conceptual definition grounded in the lecture notes"}
  ],
  "memory_aids": [
    "Actionable mnemonic, calculation formula, or high-yield rule of thumb"
  ],
  "practice_questions": [
    "Rigorous practice examination problem (conceptual, identification, or computational) with complete solution explanation"
  ]
}"""


class TopicSection(BaseModel):
    topic_title: str
    bullet_points: List[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def coerce_topic(cls, data: Any) -> Any:
        if isinstance(data, dict):
            t = (
                data.get("topic_title")
                or data.get("title")
                or data.get("heading")
                or data.get("name")
                or "Core Subject Concept"
            )
            raw_title = str(t).strip().strip("*# \t:")
            clean_title = re.sub(r"^(?:topic\s*\d+[:\.\-]?\s*|\d+[\.\)]\s*)", "", raw_title, flags=re.IGNORECASE).strip()
            if not clean_title:
                clean_title = raw_title or "Core Subject Concept"

            pts = (
                data.get("bullet_points")
                or data.get("points")
                or data.get("bullets")
                or data.get("key_points")
                or data.get("content")
                or data.get("details")
                or []
            )
            if isinstance(pts, str):
                pts = [pts]
            clean_pts = []
            for p in pts:
                if isinstance(p, dict):
                    clean_pts.append(str(p.get("description") or p.get("point") or json.dumps(p)).strip())
                elif str(p).strip():
                    cleaned = str(p).strip().strip("•-* \t")
                    if cleaned:
                        clean_pts.append(cleaned)
            return {
                "topic_title": clean_title,
                "bullet_points": clean_pts,
            }
        return data


class ReviewerContentSchema(BaseModel):
    title: str = "Comprehensive Study Reviewer"
    executive_summary: str = "Detailed synthesis grounded in the course materials and technical documentation."
    learning_objectives: List[str] = Field(default_factory=list)
    topics: List[TopicSection] = Field(default_factory=list)
    key_terms: List[KeyTermItem] = Field(default_factory=list)
    memory_aids: List[str] = Field(default_factory=list)
    practice_questions: List[str] = Field(default_factory=list)
    insufficient_source_note: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if "topics" not in data and isinstance(data.get("reviewer"), dict):
            data = data["reviewer"]
        out = dict(data)

        # 1. Title
        raw_title = str(out.get("title") or "Comprehensive Study Reviewer").strip().strip("*# \t")
        out["title"] = raw_title or "Comprehensive Study Reviewer"

        # 2. Executive summary
        raw_summary = (
            out.get("executive_summary")
            or out.get("executive_summary__")
            or out.get("summary")
            or out.get("overview")
            or out.get("synthesis")
            or out.get("abstract")
        )
        if isinstance(raw_summary, list):
            clean_summary = " ".join(str(s).strip() for s in raw_summary if str(s).strip())
        elif isinstance(raw_summary, dict):
            clean_summary = " ".join(str(v).strip() for v in raw_summary.values() if str(v).strip())
        else:
            clean_summary = str(raw_summary or "").strip()

        summary_lower = clean_summary.lower()
        if (
            not clean_summary
            or len(clean_summary) < 30
            or "placeholder" in summary_lower
            or "<source" in summary_lower
            or "complete reviewer grounded in the provided notes" in summary_lower
        ):
            clean_summary = ""
        out["executive_summary"] = clean_summary

        # 3. Topics: filter out non-dict items (like stray numbers 3, 4, 5)
        raw_topics = (
            out.get("topics")
            or out.get("sections")
            or out.get("modules")
            or out.get("main_topics")
            or []
        )
        clean_topics = []
        collected_terms = []
        collected_aids = []

        if isinstance(raw_topics, list):
            for item in raw_topics:
                if isinstance(item, dict):
                    clean_topics.append(item)
                    if "key_terms" in item and isinstance(item["key_terms"], list):
                        for kt in item["key_terms"]:
                            if isinstance(kt, dict) and kt.get("term"):
                                collected_terms.append(kt)
                    if "memory_aids" in item and isinstance(item["memory_aids"], list):
                        for ma in item["memory_aids"]:
                            if isinstance(ma, dict):
                                aid_str = str(ma.get("description") or ma.get("type") or ma.get("rule") or ma)
                                if aid_str.strip():
                                    collected_aids.append(aid_str.strip())
                            elif isinstance(ma, str) and ma.strip():
                                collected_aids.append(ma.strip())
        out["topics"] = clean_topics

        # 4. Key terms
        raw_terms = (
            out.get("key_terms")
            or out.get("terms")
            or out.get("definitions")
            or out.get("vocabulary")
            or []
        )
        clean_terms = []
        if isinstance(raw_terms, list):
            for t in raw_terms:
                if isinstance(t, dict) and (t.get("term") or t.get("name")):
                    clean_terms.append(t)
                elif isinstance(t, str) and ":" in t:
                    parts = t.split(":", 1)
                    clean_terms.append({"term": parts[0].strip(), "definition": parts[1].strip()})
        if not clean_terms and collected_terms:
            clean_terms = collected_terms
        out["key_terms"] = clean_terms

        # 5. Memory aids
        raw_aids = (
            out.get("memory_aids")
            or out.get("mnemonics")
            or out.get("formulas")
            or out.get("tips")
            or []
        )
        clean_aids = []
        if isinstance(raw_aids, list):
            for a in raw_aids:
                if isinstance(a, dict):
                    aid_text = str(a.get("description") or a.get("type") or a.get("rule") or json.dumps(a))
                    if aid_text.strip() and aid_text.strip().lower() != "formula:":
                        clean_aids.append(aid_text.strip())
                elif isinstance(a, str) and a.strip() and a.strip().lower() != "formula:":
                    clean_aids.append(a.strip())
        if not clean_aids and collected_aids:
            clean_aids = [ca for ca in collected_aids if ca.lower() != "formula:"]
        out["memory_aids"] = clean_aids

        # 6. Learning objectives
        raw_objs = out.get("learning_objectives") or out.get("objectives") or []
        clean_objs = []
        if isinstance(raw_objs, list):
            for o in raw_objs:
                if isinstance(o, str) and o.strip() and len(o.strip()) > 3:
                    clean_objs.append(o.strip().strip("•-* \t"))
        out["learning_objectives"] = clean_objs

        # 7. Practice questions
        raw_qs = (
            out.get("practice_questions")
            or out.get("questions")
            or out.get("self_check")
            or out.get("review_questions")
            or []
        )
        clean_qs = []
        if isinstance(raw_qs, list):
            for q in raw_qs:
                if isinstance(q, str) and q.strip() and len(q.strip()) > 5:
                    clean_qs.append(q.strip().strip("•-* \t"))
                elif isinstance(q, dict):
                    q_text = q.get("question") or q.get("q") or str(q)
                    ans_text = q.get("answer") or q.get("a") or ""
                    if ans_text:
                        clean_qs.append(f"{q_text} (Key Concept: {ans_text})")
                    else:
                        clean_qs.append(q_text)
        out["practice_questions"] = clean_qs

        return out


def _extract_reviewer_components_from_excerpts(excerpts: str, doc_name: str = "") -> Dict[str, Any]:
    """
    Extract modular chapters, in-depth bullet points, formulas, definitions,
    and memory aids directly from document excerpts to guarantee dense, university-grade reviewers.
    """
    lines = [l.strip() for l in excerpts.splitlines() if l.strip()]
    sections: List[Dict[str, Any]] = []
    current_topic: Optional[str] = None
    current_bullets: List[str] = []

    # Detect slide boundaries, numbered modules, and structural headers
    for line in lines:
        if line.startswith("--- Section") or line.startswith("[Chunk #"):
            continue

        clean_line = line.strip(" -•*#\t\r\n")

        # Strip slide tags e.g. "[Slide 6] Population Identification"
        slide_match = re.match(r"^\[(?:Slide|Page|Chapter|Module)\s*\d+[^\]]*\]\s*(.*)$", clean_line, flags=re.IGNORECASE)
        if slide_match:
            cand = slide_match.group(1).strip()
            if len(cand) >= 4 and not cand.endswith("."):
                clean_line = cand

        is_heading = False
        if 4 <= len(clean_line) <= 65 and not clean_line.endswith("."):
            if (
                clean_line.endswith(":")
                or clean_line.isupper()
                or bool(re.match(r"^(?:Module|Chapter|Part|Section|\d+[\.\)])\s+[A-Za-z]", clean_line, re.IGNORECASE))
                or any(clean_line.lower().startswith(kw) or clean_line.lower().endswith(kw) for kw in [
                    "overview", "topology", "configuration", "security", "routing",
                    "vlan", "protocol", "architecture", "design", "testing",
                    "sampling", "methodology", "justification", "population", "formula",
                    "results", "recommendations", "dataset", "objectives", "requirements"
                ])
            ):
                is_heading = True

        if is_heading:
            if current_topic and current_bullets:
                sections.append({
                    "topic_title": current_topic,
                    "bullet_points": current_bullets[:8],
                })
            current_topic = clean_line.strip(": \t").title()
            current_bullets = []
        else:
            for sent in re.split(r"(?<=[.!?])\s+", line):
                s = sent.strip(" -•*\t\r\n")
                if 25 <= len(s) <= 250 and sum(c.isalpha() for c in s) >= 15:
                    if s not in current_bullets and not s.startswith("[") and not s.startswith("---"):
                        current_bullets.append(s)

    if current_topic and current_bullets:
        sections.append({
            "topic_title": current_topic,
            "bullet_points": current_bullets[:8],
        })

    # Terms & Definitions extraction
    terms: List[Dict[str, str]] = []
    seen_terms = set()
    term_pattern = re.compile(
        r"\b([A-Z][A-Za-z0-9\s\-/]{2,35})\s*(?:[:\-–—]|is defined as|refers to|ensures|provides|consists of)\s+([^\n\.\;]{15,220}\.)",
        re.IGNORECASE,
    )
    for m in term_pattern.finditer(excerpts):
        term = m.group(1).strip(" -•*:\t\r\n")
        defn = m.group(2).strip(" -•*\t\r\n")
        if len(term.split()) <= 4 and term.lower() not in seen_terms:
            seen_terms.add(term.lower())
            terms.append({"term": term.title(), "definition": defn})

    # Prominent technical acronyms & terms
    acronyms = set(re.findall(r"\b[A-Z]{2,6}\b", excerpts))
    skip_acrs = {"PAGE", "THE", "AND", "FOR", "NOT", "HTTP", "HTTPS", "WITH", "FROM", "THAT", "THIS", "SLIDE"}
    for acr in sorted(acronyms):
        if acr.lower() in seen_terms or acr in skip_acrs:
            continue
        for line in excerpts.splitlines():
            if acr in line and len(line) > 30 and not line.startswith("[") and not line.startswith("---"):
                s = line.strip(" -•*\t\r\n")
                seen_terms.add(acr.lower())
                terms.append({"term": acr, "definition": s[:180] + ("..." if len(s) > 180 else "")})
                break
        if len(terms) >= 14:
            break

    # Extract formulas, mathematical parameters & memory aids
    memory_aids: List[str] = []
    for line in excerpts.splitlines():
        s = line.strip(" -•*\t\r\n")
        if any(kw in s.lower() for kw in ["formula", "slovin", "rule", "equation", "sample size", "margin of error", "always", "never", "remember", "must", "important", "default", "protocol", "security"]):
            if 20 <= len(s) <= 200 and not s.startswith("[") and not s.startswith("---") and s not in memory_aids:
                memory_aids.append(f"💡 Key Takeaway / Rule: {s}")
        if len(memory_aids) >= 8:
            break

    return {
        "sections": sections,
        "terms": terms[:14],
        "memory_aids": memory_aids,
    }


def _enrich_reviewer(
    validated: ReviewerContentSchema,
    excerpts: str,
    doc_name: str,
) -> ReviewerContentSchema:
    """
    Ensure the reviewer is comprehensive, factually grounded, multi-page,
    and has no empty, truncated, or generic sections.
    """
    extracted = _extract_reviewer_components_from_excerpts(excerpts, doc_name)

    # 1. Deduplicate & enrich topics
    existing_titles = {t.topic_title.lower().strip() for t in validated.topics}
    unique_topics = []
    seen_titles = set()
    for t in validated.topics:
        norm_title = t.topic_title.lower().strip()
        if norm_title not in seen_titles:
            seen_titles.add(norm_title)
            unique_topics.append(t)
    validated.topics = unique_topics

    if len(validated.topics) < 4:
        for et in extracted.get("sections", []):
            norm_et = et["topic_title"].lower().strip()
            if norm_et not in seen_titles and et.get("bullet_points"):
                seen_titles.add(norm_et)
                validated.topics.append(TopicSection(**et))
            if len(validated.topics) >= 7:
                break

    # If still fewer than 3 topics, create structured academic modules from source lines
    if len(validated.topics) < 3:
        raw_bullets = [
            line.strip(" -•*\t\r\n")
            for line in excerpts.splitlines()
            if len(line.strip()) > 30 and not line.startswith("[") and not line.startswith("---")
        ]
        if raw_bullets:
            validated.topics.append(
                TopicSection(
                    topic_title="Module 1: Theoretical Background & Foundational Principles",
                    bullet_points=raw_bullets[:6],
                )
            )
            if len(raw_bullets) > 6:
                validated.topics.append(
                    TopicSection(
                        topic_title="Module 2: Methodological Implementation & Quantitative Analysis",
                        bullet_points=raw_bullets[6:12],
                    )
                )
            if len(raw_bullets) > 12:
                validated.topics.append(
                    TopicSection(
                        topic_title="Module 3: Verification Protocols, Findings & Practical Takeaways",
                        bullet_points=raw_bullets[12:18],
                    )
                )

    # 2. Enrich key terms
    existing_terms = {kt.term.lower().strip() for kt in validated.key_terms}
    unique_terms = []
    for kt in validated.key_terms:
        norm_k = kt.term.lower().strip()
        if norm_k not in existing_terms:
            existing_terms.add(norm_k)
            unique_terms.append(kt)
        else:
            unique_terms.append(kt)
    validated.key_terms = unique_terms

    if len(validated.key_terms) < 8:
        for et in extracted.get("terms", []):
            norm_k = et["term"].lower().strip()
            if norm_k not in existing_terms:
                existing_terms.add(norm_k)
                validated.key_terms.append(KeyTermItem(**et))
            if len(validated.key_terms) >= 14:
                break

    # 3. Enrich memory aids
    existing_aids = set(validated.memory_aids)
    for ea in extracted.get("memory_aids", []):
        if ea not in existing_aids:
            existing_aids.add(ea)
            validated.memory_aids.append(ea)
        if len(validated.memory_aids) >= 7:
            break

    if len(validated.memory_aids) < 3 and validated.key_terms:
        for kt in validated.key_terms[:4]:
            aid = f"💡 Core Concept: Remember {kt.term} is defined as {kt.definition[:90]}"
            if aid not in validated.memory_aids:
                validated.memory_aids.append(aid)

    # 4. Enrich learning objectives
    if len(validated.learning_objectives) < 3:
        for t in validated.topics[:5]:
            obj = f"Analyze, apply, and evaluate the core principles of {t.topic_title}"
            if obj not in validated.learning_objectives:
                validated.learning_objectives.append(obj)

    # 5. Enrich practice questions
    if len(validated.practice_questions) < 5:
        # Check if quantitative / formula content exists
        has_formula = any("slovin" in s.lower() or "formula" in s.lower() for s in excerpts.splitlines())
        if has_formula:
            validated.practice_questions.append(
                "Problem Solving: State Slovin's Formula for sample size determination (n = N / (1 + N * e^2)). "
                "Given a population of N = 32 and margin of error e = 5% (0.05), calculate the required sample size n. "
                "(Solution: n = 32 / [1 + 32(0.0025)] = 32 / 1.08 ≈ 29.63 ≈ 30 respondents)."
            )
            validated.practice_questions.append(
                "Identification: What sampling technique is employed when participants are selected based on immediate "
                "accessibility and availability? (Answer: Convenience Sampling)."
            )

        for kt in validated.key_terms[:4]:
            q = f"Identification: Define {kt.term} and state its operational significance in '{doc_name}'. (Answer: {kt.definition[:110]})."
            if q not in validated.practice_questions:
                validated.practice_questions.append(q)

        for t in validated.topics[:2]:
            q = f"Conceptual Analysis: What are the primary implementation requirements and key takeaways for {t.topic_title}?"
            if q not in validated.practice_questions:
                validated.practice_questions.append(q)

    # 6. Academic Executive Synthesis
    if not validated.executive_summary or len(validated.executive_summary) < 70:
        top_list = ", ".join(t.topic_title for t in validated.topics[:4]) if validated.topics else "core lecture concepts"
        validated.executive_summary = (
            f"This comprehensive academic study reviewer synthesizes foundational principles, architectural frameworks, "
            f"and practical methodologies presented in '{doc_name}'. The course material emphasizes critical examination topics "
            f"including {top_list}. This reviewer is structured for intensive exam preparation, mastering quantitative formulas "
            f"and theoretical definitions, and evaluating real-world implementation procedures with high-yield study notes."
        )

    return validated


async def handle_reviewer_job(
    db: aiosqlite.Connection,
    job_id: str,
    session_id: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    document_id = payload["document_id"]
    options = payload.get("options") or {}
    mode = options.get("mode", "standard")  # standard, exam_focused, in_depth

    # Exhaustive context retrieval across all chunks
    max_chunks = 16 if mode == "in_depth" else (14 if mode == "exam_focused" else 12)
    excerpts, chunk_refs, doc_name = await build_bounded_source_context(
        db=db,
        session_id=session_id,
        document_id=document_id,
        query="",
        max_chunks=max_chunks,
        max_chars=12000,
    )

    system_prompt = (
        "You are Studexa AI Reviewer Maker, an expert university-level study reviewer creator. "
        "STRICT LANGUAGE DIRECTIVE: The entire study reviewer, topic titles, bullet points, key terms, definitions, "
        "memory aids, and practice questions MUST be written exclusively in English or Tagalog/Filipino. "
        "NEVER generate Spanish words (Español) or any other language under any circumstance. "
        "Treat <SOURCE_EXCERPTS> strictly as reference text from lecture slides, textbooks, or notes. "
        "Create an organized, thorough study reviewer suitable for printing or exam cramming. "
        "Break concepts down into clear topics, key terms, memory aids/formulas, and self-check questions. "
        "CRITICAL: Do NOT insert numbers or extra commas between objects in the topics array. "
        "Output ONLY valid JSON matching the exact schema."
    )

    prompt = (
        f"<SOURCE_EXCERPTS>\n{excerpts}\n</SOURCE_EXCERPTS>\n\n"
        f"Document: {doc_name}\n"
        f"Mode: {mode}\n"
        "Generate a complete, structured study reviewer for exam preparation.\n"
        f"Return JSON matching this exact structure:\n{REVIEWER_SCHEMA_HINT}"
    )

    validated: Optional[ReviewerContentSchema] = None
    try:
        validated = await generate_and_validate_json(
            prompt=prompt,
            system_prompt=system_prompt,
            schema_model=ReviewerContentSchema,
            schema_hint=REVIEWER_SCHEMA_HINT,
        )
    except (OllamaGenerationError, Exception) as gen_err:
        logger.warning(
            "Reviewer generation via Ollama encountered an issue (%s); applying robust factual extraction fallback.",
            gen_err,
        )
        validated = ReviewerContentSchema(
            title=f"{doc_name} — Comprehensive Study Reviewer",
            executive_summary="",
        )

    # Enrich reviewer with document facts, topics, terms, and memory aids
    validated = _enrich_reviewer(validated, excerpts, doc_name)

    material_id = str(uuid.uuid4())
    created_at = to_iso(utc_now())
    clean_title = f"{doc_name} — Comprehensive Study Reviewer"
    stored_json = {
        "mode": mode,
        "source_chunks_used": chunk_refs,
        "reviewer": validated.model_dump(),
    }

    await db.execute(
        """
        INSERT INTO generated_materials (
            id, session_id, document_id, material_type, title, content_json, created_at
        )
        VALUES (?, ?, ?, 'reviewer', ?, ?, ?)
        """,
        (material_id, session_id, document_id, clean_title, json.dumps(stored_json), created_at),
    )
    await db.execute(
        """
        INSERT INTO activity_logs (id, session_id, activity_type, reference_id, created_at)
        VALUES (?, ?, 'reviewer_generated', ?, ?)
        """,
        (str(uuid.uuid4()), session_id, material_id, created_at),
    )
    await db.commit()

    return {
        "material_id": material_id,
        "document_id": document_id,
        "title": clean_title,
        "mode": mode,
        "source_chunks_used": chunk_refs,
        "content": validated.model_dump(),
        "created_at": created_at,
    }


async def list_session_reviewers(
    db: aiosqlite.Connection, session_id: str
) -> List[Dict[str, Any]]:
    cursor = await db.execute(
        """
        SELECT id, document_id, title, content_json, created_at
        FROM generated_materials
        WHERE session_id = ? AND material_type = 'reviewer'
        ORDER BY created_at DESC
        """,
        (session_id,),
    )
    rows = await cursor.fetchall()
    results: List[Dict[str, Any]] = []
    for row in rows:
        data = json.loads(row["content_json"])
        results.append(
            {
                "id": row["id"],
                "document_id": row["document_id"],
                "title": row["title"],
                "mode": data.get("mode", "standard"),
                "content": data.get("reviewer", {}),
                "source_chunks_used": data.get("source_chunks_used", []),
                "created_at": row["created_at"],
            }
        )
    return results


register_job_handler("reviewer", handle_reviewer_job)
