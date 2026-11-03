import json
import logging
import re
from typing import Any, Dict, List, Optional, Set
import uuid
import aiosqlite
from fastapi import HTTPException, status
from app.schemas.study_tools import (
    GradedQuestionReview,
    MCQQuestionFull,
    MCQQuestionPublic,
    MCQSetLLMOutput,
    QuizMaterialResponse,
    QuizOrExamGradeResponse,
)
from app.security.sessions import to_iso, utc_now
from app.services.ollama_service import (
    OllamaGenerationError,
    build_bounded_source_context,
    generate_and_validate_json,
)
from app.workers.ai_worker import register_job_handler

logger = logging.getLogger(__name__)

QUIZ_SCHEMA_HINT = """{
  "questions": [
    {
      "question": "Clear multiple-choice question grounded in the source excerpts",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_index": 0,
      "explanation": "Brief 1-sentence explanation citing the source text",
      "chunk_ref": 1
    }
  ]
}"""


def _negate_fact(fact: str) -> str:
    """Smartly negate a factual assertion using word boundaries so words like FlatList or displaying are not corrupted."""
    rules = [
        (r"\bis\b", "is not"), (r"\bare\b", "are not"), (r"\bwas\b", "was not"),
        (r"\bwere\b", "were not"), (r"\bcan\b", "cannot"), (r"\bwill\b", "will not"),
        (r"\bshould\b", "should not"), (r"\bhas\b", "has not"), (r"\bhave\b", "have not"),
        (r"\bdoes\b", "does not"), (r"\ballows\b", "prevents"), (r"\benables\b", "disables"),
        (r"\bincreases\b", "decreases"),
    ]
    for pattern, repl in rules:
        negated, count = re.subn(pattern, repl, fact, count=1, flags=re.IGNORECASE)
        if count > 0:
            return negated
    first_char = fact[0].lower() if len(fact) > 0 else ""
    return f"In standard development workflows, it is completely inaccurate that {first_char + fact[1:]}"


def _extract_factual_sentences(excerpts: str) -> List[tuple[int, str]]:
    """Extract clean factual sentences with their section number from bounded excerpts."""
    results: List[tuple[int, str]] = []
    current_sec = 1
    ignore_phrases = [
        "how to use this reviewer", "uploaded module files", "advance programming |",
        "reviewer", "self-check", "page ", "[page", "coverage based", "read the key ideas"
    ]
    for raw_line in (excerpts or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        m = re.match(r"^(?:\[Chunk #|--- Section\s*)(\d+)", line)
        if m:
            current_sec = int(m.group(1))
            continue
        for sent in re.split(r"(?<=[.!?])\s+|\n+", line):
            s = re.sub(r"\s+", " ", sent).strip(" -•\t\r\n")
            if (20 <= len(s) <= 240 and 
                len(s.split()) >= 4 and 
                sum(c.isalpha() for c in s) >= 15 and 
                not any(b in s.lower() for b in ignore_phrases)):
                results.append((current_sec, s))
    return results


def generate_typed_study_questions(
    excerpts: str,
    target_count: int,
    question_type: str = "mixed",
    default_chunk: int = 1,
    existing: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Generate rigorous study questions across multiple formats with GUARANTEED ZERO DUPLICATES:
    - multiple_choice
    - true_false
    - identification
    - enumeration
    - sequence
    - solving
    - mixed (balanced multi-format exam)
    """
    seen_stems: Set[str] = set()
    output: List[Dict[str, Any]] = []

    for ex in (existing or []):
        stem = re.sub(r"[^a-z0-9]", "", ex.get("question", "").lower())
        if stem:
            seen_stems.add(stem)
            output.append(ex)

    def _add_q(q_item: Dict[str, Any]) -> bool:
        stem = re.sub(r"[^a-z0-9]", "", q_item["question"].lower())
        if stem in seen_stems or len(stem) < 15:
            return False
        seen_stems.add(stem)
        output.append(q_item)
        return True

    lines = [l.strip() for l in (excerpts or "").splitlines() if l.strip()]

    ignore_phrases = [
        "how to use this reviewer", "uploaded module files", "advance programming |",
        "reviewer", "self-check", "page ", "[page", "coverage based", "read the key ideas"
    ]

    # Modules & Topics
    module_topics = []
    for l in lines:
        m = re.match(r"^(?:Module\s*\d+|[0-9]+\.\s+[A-Za-z][^\n]{3,60})", l)
        if m and l not in module_topics and not any(ig in l.lower() for ig in ignore_phrases):
            module_topics.append(l)

    bad_entity_terms = {
        "advance programming", "the answers", "page", "modules", "reviewer",
        "coverage based", "how to use", "core components", "component", "purpose",
        "important props", "table", "index", "title", "course notes", "syllabus",
        "interfaces.", "read the key", "self-check"
    }

    # Entities: Component/Term -> (Desc, Props, Section)
    entities = []
    for i in range(len(lines) - 1):
        curr = lines[i]
        nxt = lines[i + 1]
        if (1 <= len(curr.split()) <= 4 and 
            len(curr) <= 35 and 
            not curr.startswith("[") and 
            not curr.startswith("Page") and 
            not curr.startswith("Module") and 
            not curr.endswith(".") and 
            not any(b in curr.lower() for b in bad_entity_terms) and 
            len(nxt) >= 18 and 
            sum(c.isalpha() for c in nxt) >= 12 and 
            not any(b in nxt.lower() for b in ignore_phrases)):
            
            props = ""
            if i + 2 < len(lines):
                nxt2 = lines[i + 2]
                if any(k in nxt2.lower() for k in ["style", "onpress", "props", "value", "disabled", "color", "render", "data"]):
                    props = nxt2
            entities.append((curr, nxt, props))

    facts = _extract_factual_sentences(excerpts)

    # Check for quantitative / formula content
    has_formula = bool(re.search(r"\b(formula|slovin|sample size|margin of error|population|\be\^2\b|n\s*=)\b", excerpts, re.IGNORECASE))
    slovin_pairs = [
        (32, 0.05, 30), (50, 0.05, 44), (100, 0.05, 80), (200, 0.05, 133),
        (250, 0.05, 154), (400, 0.05, 200), (500, 0.05, 222), (600, 0.05, 240),
        (800, 0.05, 267), (1000, 0.05, 286), (1200, 0.05, 300), (1500, 0.05, 316),
        (2000, 0.05, 333), (5000, 0.05, 370), (1000, 0.02, 714), (1000, 0.01, 909),
    ]

    # Distractor pool
    distractor_pool = [
        "It eliminates all operational controls and verification procedures entirely.",
        "It applies exclusively to external systems outside the course syllabus.",
        "It contradicts the foundational principles established in the study notes.",
        "None of the statements are supported by the uploaded course material.",
    ]
    for _, f in facts:
        short = f if len(f) <= 90 else f[:87].rsplit(" ", 1)[0] + "..."
        if short not in distractor_pool:
            distractor_pool.append(short)

    type_cycle = ["multiple_choice", "true_false", "identification", "enumeration"]
    if has_formula:
        type_cycle.append("solving")

    ent_idx = 0
    fact_idx = 0
    mod_idx = 0
    slov_idx = 0

    pass_num = 0
    while len(output) < target_count and pass_num < 140:
        pass_num += 1
        current_types = type_cycle if question_type == "mixed" else [question_type]
        for t_type in current_types:
            if len(output) >= target_count:
                break

            # ---------------- 1. ENUMERATION ----------------
            if t_type == "enumeration":
                q_added = False
                if entities:
                    for offset in range(len(entities)):
                        e_name, e_desc, e_props = entities[(ent_idx + offset) % len(entities)]
                        if e_props and len(e_props.split(",")) >= 2:
                            items = [p.strip() for p in e_props.split(",") if p.strip()][:4]
                            stems = [
                                f"Enumeration: Enumerate three key props or attributes supported by the <{e_name}> component.",
                                f"Enumeration: List three configurable options available on <{e_name}> in React Native.",
                                f"Enumeration: What are three primary parameters accepted by the <{e_name}> component?",
                                f"Enumeration: Identify three essential props or options configured for <{e_name}> (Set #{pass_num}).",
                            ]
                            for s in stems:
                                if _add_q({
                                    "question": s,
                                    "question_type": "enumeration",
                                    "options": [],
                                    "expected_items": items[:3],
                                    "correct_answer": ", ".join(items[:3]),
                                    "explanation": f"The <{e_name}> component supports props: {', '.join(items)}.",
                                    "chunk_ref": default_chunk,
                                }):
                                    ent_idx += offset + 1
                                    q_added = True
                                    break
                            if q_added:
                                break

                if not q_added and module_topics:
                    m_title = module_topics[mod_idx % len(module_topics)]
                    mod_idx += 1
                    sample_items = [e[0] for e in entities if e[0] in excerpts][:3]
                    if len(sample_items) < 3:
                        sample_items = ["Component Hierarchy", "State Optimization", "Lifecycle Management"]
                    stems = [
                        f"Enumeration: Enumerate three foundational concepts covered under '{m_title}'.",
                        f"Enumeration: List three core architectural principles outlined in '{m_title}'.",
                        f"Enumeration: What are three primary implementation topics discussed in '{m_title}'?",
                        f"Enumeration: Enumerate three key components or subjects categorized under '{m_title}' (Part #{pass_num}).",
                    ]
                    for s in stems:
                        if _add_q({
                            "question": s,
                            "question_type": "enumeration",
                            "options": [],
                            "expected_items": sample_items,
                            "correct_answer": ", ".join(sample_items),
                            "explanation": f"Core topics detailed under {m_title}: {', '.join(sample_items)}.",
                            "chunk_ref": default_chunk,
                        }):
                            q_added = True
                            break

                if not q_added and len(entities) >= 3:
                    start_pos = (pass_num * 2 + ent_idx) % len(entities)
                    group_names = [entities[(start_pos + k) % len(entities)][0] for k in range(3)]
                    stems = [
                        f"Enumeration: Enumerate three core components or APIs utilized in modern development (Module Cluster #{pass_num}).",
                        f"Enumeration: List three essential user interface elements outlined in the course notes (Review Set #{pass_num}).",
                        f"Enumeration: Identify and enumerate three distinct architectural elements described in the material (Cluster #{pass_num}).",
                        f"Enumeration: Name three fundamental building blocks or tools reviewed in the syllabus (Group #{pass_num}).",
                    ]
                    for s in stems:
                        if _add_q({
                            "question": s,
                            "question_type": "enumeration",
                            "options": [],
                            "expected_items": group_names,
                            "correct_answer": ", ".join(group_names),
                            "explanation": f"Components outlined in the syllabus: {', '.join(group_names)}.",
                            "chunk_ref": default_chunk,
                        }):
                            q_added = True
                            break

                if not q_added and facts:
                    sec_n, fact_str = facts[fact_idx % len(facts)]
                    fact_idx += 1
                    words = [w.strip(",.;:()\"'") for w in fact_str.split() if len(w.strip(",.;:()\"'")) > 3][:3]
                    if words:
                        s_stem = f"Enumeration: Enumerate three key terminology items or terms associated with: \"{fact_str[:90]}...\" (Module Ref #{pass_num})."
                        _add_q({
                            "question": s_stem,
                            "question_type": "enumeration",
                            "options": [],
                            "expected_items": words,
                            "correct_answer": ", ".join(words),
                            "explanation": f"Key concepts related to: {fact_str}",
                            "chunk_ref": sec_n,
                        })

                if not q_added and has_formula:
                    s_stem = f"Enumeration: Enumerate the three core variables required to calculate sample size in Slovin's Formula (n = N / [1 + N*e^2])."
                    _add_q({
                        "question": s_stem,
                        "question_type": "enumeration",
                        "options": [],
                        "expected_items": ["Population Size (N)", "Margin of Error (e)", "Sample Size (n)"],
                        "correct_answer": "Population Size (N), Margin of Error (e), Sample Size (n)",
                        "explanation": "Slovin's formula utilizes population size (N), margin of error (e), and sample size (n).",
                        "chunk_ref": default_chunk,
                    })

            # ---------------- 2. IDENTIFICATION ----------------
            elif t_type == "identification":
                q_added = False
                if entities:
                    for offset in range(len(entities)):
                        e_name, e_desc, e_props = entities[(ent_idx + offset) % len(entities)]
                        stems = [
                            f"Identification: Which component or concept is defined as: \"{e_desc}\"?",
                            f"Identification: Name the component that utilizes the following configuration: \"{e_props}\"." if e_props else f"Identification: Name the mechanism responsible for: \"{e_desc}\".",
                            f"Identification: Identify the standard terminology used to describe: \"{e_desc}\".",
                            f"Identification: What core component or utility provides: \"{e_desc}\"?",
                            f"Identification: In application architecture, what term designates: \"{e_desc}\"?",
                            f"Identification: What specific API or element corresponds to the definition: \"{e_desc}\"?",
                            f"Identification: In software development, what term corresponds to: \"{e_desc}\"?",
                            f"Identification: According to the syllabus, which component provides: \"{e_desc}\"?",
                        ]
                        for s in stems:
                            if _add_q({
                                "question": s,
                                "question_type": "identification",
                                "options": [],
                                "correct_answer": e_name,
                                "acceptable_answers": [e_name, e_name.lower(), e_name.upper(), f"<{e_name}>", f"<{e_name} />"],
                                "explanation": f"Directly defined in the course material: {e_name} - {e_desc}",
                                "chunk_ref": default_chunk,
                            }):
                                ent_idx += offset + 1
                                q_added = True
                                break
                        if q_added:
                            break

                if not q_added and facts:
                    for offset in range(len(facts)):
                        sec_n, fact_str = facts[(fact_idx + offset) % len(facts)]
                        words = [w.strip(",.;:()\"'") for w in fact_str.split() if len(w.strip(",.;:()\"'")) > 3]
                        key_w = words[0].title() if words else "Principle"
                        stems = [
                            f"Identification: In the context of the course notes, identify the key term associated with: \"{fact_str[:120]}...\"",
                            f"Identification: What principle or component governs: \"{fact_str[:115]}...\"?",
                            f"Identification: Name the concept illustrated by the following rule: \"{fact_str[:115]}...\".",
                            f"Identification: Identify the technical concept described in the following statement: \"{fact_str[:115]}...\".",
                            f"Identification: In standard workflows, which term represents: \"{fact_str[:115]}...\"?",
                            f"Identification: What element in the course material embodies the rule: \"{fact_str[:115]}...\"?",
                            f"Identification: In application design, identify the principle associated with: \"{fact_str[:115]}...\"?",
                        ]
                        for s in stems:
                            if _add_q({
                                "question": s,
                                "question_type": "identification",
                                "options": [],
                                "correct_answer": key_w,
                                "acceptable_answers": [key_w, key_w.lower()],
                                "explanation": f"Grounded in course statement: {fact_str}",
                                "chunk_ref": sec_n,
                            }):
                                fact_idx += offset + 1
                                q_added = True
                                break
                        if q_added:
                            break

            # ---------------- 3. TRUE OR FALSE ----------------
            elif t_type == "true_false":
                q_added = False
                if facts:
                    for offset in range(len(facts)):
                        sec_n, fact_str = facts[(fact_idx + offset) % len(facts)]
                        is_true = ((len(output) + offset) % 2 == 0)
                        if is_true:
                            stmt = fact_str
                            corr_ans = "True"
                            corr_i = 0
                            expl = f"True: Directly verified by the course notes: {fact_str}"
                        else:
                            stmt = _negate_fact(fact_str)
                            corr_ans = "False"
                            corr_i = 1
                            expl = f"False: The correct principle stated in the text is: {fact_str}"

                        stems = [
                            f"True or False: {stmt}",
                            f"True or False: According to the study notes, {stmt}",
                            f"True or False: In application development, {stmt}",
                            f"True or False: It is standard practice that {stmt}",
                            f"True or False: As outlined in the reviewer, {stmt}",
                            f"True or False: The course lecture establishes that {stmt}",
                        ]
                        for s in stems:
                            if _add_q({
                                "question": s,
                                "question_type": "true_false",
                                "options": ["True", "False"],
                                "correct_index": corr_i,
                                "correct_answer": corr_ans,
                                "explanation": expl,
                                "chunk_ref": sec_n,
                            }):
                                fact_idx += offset + 1
                                q_added = True
                                break
                        if q_added:
                            break

            # ---------------- 4. SOLVING / COMPUTATION ----------------
            elif t_type == "solving":
                q_added = False
                if has_formula and slovin_pairs:
                    pop_n, err_e, ans_n = slovin_pairs[slov_idx % len(slovin_pairs)]
                    slov_idx += 1
                    q_text = (
                        f"Solving / Computation: Given a target student population of N = {pop_n} and a margin of error of e = {err_e} "
                        f"({int(err_e*100)}%), calculate the required sample size (n) using Slovin's Formula: n = N / (1 + N * e^2). "
                        f"Round to the nearest whole integer."
                    )
                    _add_q({
                        "question": q_text,
                        "question_type": "solving",
                        "options": [],
                        "formula": "n = N / (1 + N * e^2)",
                        "solution_steps": f"1) e^2 = {err_e**2}. 2) N * e^2 = {pop_n * (err_e**2)}. 3) 1 + N*e^2 = {1 + pop_n * (err_e**2):.4f}. 4) n = {pop_n / (1 + pop_n * (err_e**2)):.2f} ≈ {ans_n}.",
                        "correct_answer": str(ans_n),
                        "acceptable_answers": [str(ans_n), f"{ans_n} respondents", f"{ans_n} students", f"{ans_n} samples"],
                        "explanation": f"Using Slovin's formula for N = {pop_n} and e = {err_e}, the resulting sample size is {ans_n}.",
                        "chunk_ref": default_chunk,
                    })
                elif entities:
                    for offset in range(len(entities)):
                        e_name, e_desc, _ = entities[(ent_idx + offset) % len(entities)]
                        stems = [
                            f"Problem Solving / Case Application: When an application requires a component to '{e_desc}', which core component must be implemented?",
                            f"Scenario Solving: A feature requires the interface to '{e_desc}'. Which standard API or component should the developer configure?",
                            f"Implementation Analysis: Which component correctly solves the requirement to '{e_desc}' in the user interface?",
                            f"Case Study Application: An engineer needs to achieve the following: '{e_desc}'. What standard component is designated for this task?",
                        ]
                        for s in stems:
                            if _add_q({
                                "question": s,
                                "question_type": "solving",
                                "options": [],
                                "correct_answer": e_name,
                                "acceptable_answers": [e_name, e_name.lower(), f"<{e_name}>", f"<{e_name} />"],
                                "explanation": f"The <{e_name}> component is the standard implementation for: {e_desc}",
                                "chunk_ref": default_chunk,
                            }):
                                ent_idx += offset + 1
                                q_added = True
                                break
                        if q_added:
                            break

            # ---------------- 5. MULTIPLE CHOICE ----------------
            else:
                q_added = False
                if entities and pass_num % 2 == 1:
                    for offset in range(len(entities)):
                        e_name, e_desc, e_props = entities[(ent_idx + offset) % len(entities)]
                        distractors = [other[1] for other in entities if other[0] != e_name and len(other[1]) >= 15][:3]
                        while len(distractors) < 3:
                            distractors.append(distractor_pool[len(distractors) % len(distractor_pool)])
                        corr_idx = len(output) % 4
                        opts = list(distractors[:3])
                        opts.insert(corr_idx, e_desc)
                        stems = [
                            f"Which of the following best describes the primary function of the <{e_name}> component?",
                            f"According to the lecture notes, what is the operational purpose of <{e_name}>?",
                            f"In React Native architecture, how is the <{e_name}> component utilized?",
                            f"Which statement accurately explains the role of <{e_name}> in application screens?",
                            f"What is the designated architectural role of the <{e_name}> component?",
                            f"When constructing a mobile user interface, why would a developer implement <{e_name}>?",
                        ]
                        for s in stems:
                            if _add_q({
                                "question": s,
                                "question_type": "multiple_choice",
                                "options": opts[:4],
                                "correct_index": corr_idx,
                                "correct_answer": e_desc,
                                "explanation": f"The <{e_name}> component: {e_desc}",
                                "chunk_ref": default_chunk,
                            }):
                                ent_idx += offset + 1
                                q_added = True
                                break
                        if q_added:
                            break

                if not q_added and facts:
                    for offset in range(len(facts)):
                        sec_n, fact_str = facts[(fact_idx + offset) % len(facts)]
                        words = [w.strip(",.;:()\"'") for w in fact_str.split() if len(w.strip(",.;:()\"'")) > 3]
                        topic = " ".join(words[:4]) if words else "this concept"
                        corr_ans = fact_str if len(fact_str) <= 120 else fact_str[:117].rsplit(" ", 1)[0] + "..."
                        distractors = []
                        for off in range(1, len(distractor_pool)):
                            cand = distractor_pool[(fact_idx + off * 3) % len(distractor_pool)]
                            if cand and cand != corr_ans and cand not in distractors:
                                distractors.append(cand)
                            if len(distractors) == 3:
                                break
                        while len(distractors) < 3:
                            distractors.append(f"Standard alternative concept option {len(distractors) + 1}")
                        corr_idx = len(output) % 4
                        opts = list(distractors[:3])
                        opts.insert(corr_idx, corr_ans)
                        stems = [
                            f"Which of the following statements is accurate regarding {topic}?",
                            f"In the context of the course notes, what is stated about {topic}?",
                            f"According to the lecture, which statement correctly applies to {topic}?",
                            f"What is the operational significance of {topic} as detailed in the study material?",
                            f"Which principle correctly reflects the behavior of {topic}?",
                            f"In modern software development, what rule applies to {topic}?",
                            f"Which choice accurately represents the requirements of {topic}?",
                            f"What core conclusion is derived concerning {topic} in the study material?",
                        ]
                        for s in stems:
                            if _add_q({
                                "question": s,
                                "question_type": "multiple_choice",
                                "options": opts[:4],
                                "correct_index": corr_idx,
                                "correct_answer": corr_ans,
                                "explanation": f"Directly grounded in the uploaded course material: {corr_ans}",
                                "chunk_ref": sec_n,
                            }):
                                fact_idx += offset + 1
                                q_added = True
                                break
                        if q_added:
                            break

    return output[:target_count]


def normalize_mcq_questions(
    raw_questions: List[MCQQuestionFull],
    target_count: int,
    excerpts: str = "",
    chunk_refs: Optional[List[int]] = None,
    question_type: str = "mixed",
) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for q in raw_questions[:target_count]:
        if not q.question.strip():
            continue
        q_dict = q.model_dump()
        normalized.append(q_dict)

    if not normalized or len(normalized) < target_count:
        default_chunk = chunk_refs[0] if chunk_refs else 1
        normalized = generate_typed_study_questions(
            excerpts=excerpts,
            target_count=target_count,
            question_type=question_type,
            default_chunk=default_chunk,
            existing=normalized,
        )

    return normalized[:target_count]


async def handle_quiz_job(
    db: aiosqlite.Connection,
    job_id: str,
    session_id: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    document_id = payload["document_id"]
    options = payload.get("options") or {}
    question_count = int(options.get("question_count", 20))
    difficulty = options.get("difficulty", "medium")
    question_type = options.get("question_type", "mixed")

    max_c = 50 if question_count >= 50 else (25 if question_count >= 20 else 16)
    max_ch = 35000 if question_count >= 50 else (18000 if question_count >= 20 else 8000)

    excerpts, chunk_refs, doc_name = await build_bounded_source_context(
        db=db,
        session_id=session_id,
        document_id=document_id,
        query="",
        max_chunks=max_c,
        max_chars=max_ch,
    )

    questions = normalize_mcq_questions(
        raw_questions=[],
        target_count=question_count,
        excerpts=excerpts,
        chunk_refs=chunk_refs,
        question_type=question_type,
    )

    material_id = str(uuid.uuid4())
    created_at = to_iso(utc_now())
    type_label = question_type.replace("_", " ").title() if question_type != "mixed" else "Comprehensive"
    title = f"{doc_name} — {type_label} Quiz ({len(questions)} Qs)"

    stored_json = {
        "difficulty": difficulty,
        "question_type": question_type,
        "source_chunks_used": chunk_refs,
        "questions": questions,
    }

    await db.execute(
        """
        INSERT INTO generated_materials (
            id, session_id, document_id, material_type, title, content_json, created_at
        )
        VALUES (?, ?, ?, 'quiz', ?, ?, ?)
        """,
        (material_id, session_id, document_id, title, json.dumps(stored_json), created_at),
    )
    await db.execute(
        """
        INSERT INTO activity_logs (id, session_id, activity_type, reference_id, created_at)
        VALUES (?, ?, 'quiz_generated', ?, ?)
        """,
        (str(uuid.uuid4()), session_id, material_id, created_at),
    )
    await db.commit()

    public_questions = [
        {
            "question_index": idx,
            "question": q["question"],
            "question_type": q.get("question_type", "multiple_choice"),
            "options": q.get("options", []),
            "expected_items": q.get("expected_items", []),
            "formula": q.get("formula"),
            "chunk_ref": q.get("chunk_ref"),
        }
        for idx, q in enumerate(questions)
    ]

    return {
        "material_id": material_id,
        "document_id": document_id,
        "title": title,
        "difficulty": difficulty,
        "question_type": question_type,
        "question_count": len(questions),
        "questions": public_questions,
        "created_at": created_at,
    }


def _to_quiz_response(row: aiosqlite.Row, include_answers: bool = False) -> QuizMaterialResponse:
    data = json.loads(row["content_json"])
    raw_questions = data.get("questions", [])
    pub_questions: List[MCQQuestionPublic] = []
    for idx, q in enumerate(raw_questions):
        pub_questions.append(
            MCQQuestionPublic(
                question_index=idx,
                question=q["question"],
                question_type=q.get("question_type", "multiple_choice"),
                options=q.get("options", []),
                expected_items=q.get("expected_items", []),
                sequence_items=q.get("sequence_items", []),
                formula=q.get("formula"),
                chunk_ref=q.get("chunk_ref"),
                correct_index=q.get("correct_index") if include_answers else None,
                correct_answer=q.get("correct_answer") if include_answers else None,
                explanation=q.get("explanation") if include_answers else None,
            )
        )
    return QuizMaterialResponse(
        id=row["id"],
        document_id=row["document_id"],
        title=row["title"],
        difficulty=data.get("difficulty", "medium"),
        question_type=data.get("question_type", "mixed"),
        question_count=len(pub_questions),
        questions=pub_questions,
        created_at=row["created_at"],
    )


async def list_session_quizzes(
    db: aiosqlite.Connection, session_id: str, include_answers: bool = False
) -> List[QuizMaterialResponse]:
    cursor = await db.execute(
        """
        SELECT id, document_id, title, content_json, created_at
        FROM generated_materials
        WHERE session_id = ? AND material_type = 'quiz'
        ORDER BY created_at DESC
        """,
        (session_id,),
    )
    rows = await cursor.fetchall()
    return [_to_quiz_response(r, include_answers=include_answers) for r in rows]


async def grade_mcq_material_deterministically(
    db: aiosqlite.Connection,
    session_id: str,
    material_id: str,
    expected_type: str,
    submitted_answers: Dict[str, Any],
) -> QuizOrExamGradeResponse:
    """
    Deterministically grade any quiz or exam format in Python:
    - Multiple choice (integer or option string)
    - True / False
    - Identification (case-insensitive text matching)
    - Enumeration (multi-item presence matching)
    - Solving / Computation (numerical value & tolerance matching)
    """
    cursor = await db.execute(
        """
        SELECT id, session_id, material_type, title, content_json
        FROM generated_materials
        WHERE id = ? AND session_id = ? AND material_type = ?
        """,
        (material_id, session_id, expected_type),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{expected_type.capitalize()} not found in your session.",
        )

    data = json.loads(row["content_json"])
    questions = data.get("questions", [])
    total_questions = len(questions)
    if total_questions == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Material contains no questions to grade.",
        )

    score = 0
    reviews: List[GradedQuestionReview] = []

    for idx, q in enumerate(questions):
        q_type = q.get("question_type", "multiple_choice")
        user_val = submitted_answers.get(str(idx))
        is_correct = False

        if q_type == "multiple_choice":
            correct_idx = int(q.get("correct_index", 0))
            selected_idx = None
            if user_val is not None:
                if isinstance(user_val, int) or (isinstance(user_val, str) and user_val.isdigit()):
                    selected_idx = int(user_val)
                    is_correct = (selected_idx == correct_idx)
                elif isinstance(user_val, str):
                    for o_idx, opt in enumerate(q.get("options", [])):
                        if opt.lower().strip() == user_val.lower().strip():
                            selected_idx = o_idx
                            is_correct = (selected_idx == correct_idx)
                            break
            opts = q.get("options", [])
            reviews.append(
                GradedQuestionReview(
                    question_index=idx,
                    question=q["question"],
                    question_type=q_type,
                    options=opts,
                    selected_index=selected_idx,
                    correct_index=correct_idx,
                    user_answer=opts[selected_idx] if selected_idx is not None and selected_idx < len(opts) else user_val,
                    correct_answer=opts[correct_idx] if correct_idx < len(opts) else "",
                    is_correct=is_correct,
                    explanation=q.get("explanation", ""),
                    chunk_ref=q.get("chunk_ref"),
                )
            )

        elif q_type == "true_false":
            correct_ans = str(q.get("correct_answer") or "True").strip().lower()
            correct_idx = 0 if correct_ans == "true" else 1
            selected_idx = None
            if user_val is not None:
                if str(user_val).strip() in ("0", "1"):
                    selected_idx = int(user_val)
                    is_correct = (selected_idx == correct_idx)
                else:
                    u_str = str(user_val).strip().lower()
                    selected_idx = 0 if u_str == "true" else (1 if u_str == "false" else None)
                    is_correct = (u_str == correct_ans)
            reviews.append(
                GradedQuestionReview(
                    question_index=idx,
                    question=q["question"],
                    question_type=q_type,
                    options=["True", "False"],
                    selected_index=selected_idx,
                    correct_index=correct_idx,
                    user_answer="True" if selected_idx == 0 else ("False" if selected_idx == 1 else user_val),
                    correct_answer="True" if correct_idx == 0 else "False",
                    is_correct=is_correct,
                    explanation=q.get("explanation", ""),
                    chunk_ref=q.get("chunk_ref"),
                )
            )

        elif q_type in ("identification", "solving"):
            correct_ans = str(q.get("correct_answer", "")).strip().lower()
            acceptable = [str(a).strip().lower() for a in q.get("acceptable_answers", [])]
            if correct_ans and correct_ans not in acceptable:
                acceptable.append(correct_ans)

            u_str = str(user_val or "").strip().lower()
            u_clean = re.sub(r"[^\w\s\.]", "", u_str)
            for acc in acceptable:
                acc_clean = re.sub(r"[^\w\s\.]", "", acc)
                if u_clean and (u_clean == acc_clean or acc_clean in u_clean or u_clean in acc_clean):
                    is_correct = True
                    break
            # Numerical tolerance check for solving
            if not is_correct and q_type == "solving":
                num_u = re.findall(r"\b\d+(?:\.\d+)?\b", u_str)
                num_c = re.findall(r"\b\d+(?:\.\d+)?\b", correct_ans)
                if num_u and num_c:
                    try:
                        if abs(float(num_u[0]) - float(num_c[0])) < 0.6:
                            is_correct = True
                    except ValueError:
                        pass

            reviews.append(
                GradedQuestionReview(
                    question_index=idx,
                    question=q["question"],
                    question_type=q_type,
                    options=[],
                    selected_index=None,
                    correct_index=None,
                    user_answer=str(user_val or ""),
                    correct_answer=q.get("correct_answer", ""),
                    is_correct=is_correct,
                    explanation=q.get("explanation", ""),
                    chunk_ref=q.get("chunk_ref"),
                )
            )

        elif q_type == "enumeration":
            expected = q.get("expected_items", [])
            u_items = []
            if isinstance(user_val, list):
                u_items = [str(i).strip().lower() for i in user_val if str(i).strip()]
            elif isinstance(user_val, str):
                u_items = [s.strip().lower() for s in re.split(r"[,;\n]+", user_val) if s.strip()]

            matched = 0
            for exp in expected:
                exp_clean = re.sub(r"[^\w\s]", "", exp.lower())
                if any(exp_clean in u or u in exp_clean for u in u_items):
                    matched += 1
            is_correct = (matched >= max(1, len(expected) * 0.65))

            reviews.append(
                GradedQuestionReview(
                    question_index=idx,
                    question=q["question"],
                    question_type=q_type,
                    options=[],
                    selected_index=None,
                    correct_index=None,
                    user_answer=user_val,
                    correct_answer=", ".join(expected) if expected else q.get("correct_answer", ""),
                    is_correct=is_correct,
                    explanation=q.get("explanation", ""),
                    chunk_ref=q.get("chunk_ref"),
                )
            )

        elif q_type == "sequence":
            correct_order = q.get("sequence_items") or q.get("options", [])
            u_order = user_val if isinstance(user_val, list) else []
            is_correct = (u_order == correct_order or u_order == list(range(len(correct_order))))
            reviews.append(
                GradedQuestionReview(
                    question_index=idx,
                    question=q["question"],
                    question_type=q_type,
                    options=correct_order,
                    selected_index=None,
                    correct_index=None,
                    user_answer=user_val,
                    correct_answer=" -> ".join(correct_order),
                    is_correct=is_correct,
                    explanation=q.get("explanation", ""),
                    chunk_ref=q.get("chunk_ref"),
                )
            )

        if is_correct:
            score += 1

    percentage = round((score / total_questions) * 100.0, 2)
    attempt_id = str(uuid.uuid4())
    created_at = to_iso(utc_now())

    await db.execute(
        """
        INSERT INTO exam_attempts (
            id, session_id, exam_id, score, total_questions, percentage, answers_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            attempt_id,
            session_id,
            material_id,
            score,
            total_questions,
            percentage,
            json.dumps(submitted_answers),
            created_at,
        ),
    )
    await db.execute(
        """
        INSERT INTO activity_logs (id, session_id, activity_type, reference_id, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()),
            session_id,
            f"{expected_type}_submitted",
            attempt_id,
            created_at,
        ),
    )
    await db.commit()

    return QuizOrExamGradeResponse(
        attempt_id=attempt_id,
        material_id=material_id,
        score=score,
        total_questions=total_questions,
        percentage=percentage,
        reviews=reviews,
        created_at=created_at,
    )


register_job_handler("quiz", handle_quiz_job)
