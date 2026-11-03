import io
import json
import logging
from pathlib import Path
import re
from typing import Any
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from app.config import settings

logger = logging.getLogger(__name__)

UNICODE_REPLACEMENTS = {
    "\u2248": " ≈ ",
    "\u03b1": "alpha",
    "\u03b2": "beta",
    "\u03bc": "mu",
    "\u03c3": "sigma",
    "\u2019": "'",
    "\u2018": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": " - ",
    "\u2014": " — ",
    "\u2022": "*",
    "\u2026": "...",
    "\u2264": "<=",
    "\u2265": ">=",
    "\u00b1": "+/-",
    "\u00d7": "x",
    "\u00f7": "/",
    "\u00b2": "^2",
    "\u00b3": "^3",
}


def sanitize_text_for_pdf(text: Any) -> str:
    """Replace non-Latin-1 unicode symbols and math glyphs with safe ASCII representations."""
    if text is None:
        return ""
    s = str(text)
    for glyph, rep in UNICODE_REPLACEMENTS.items():
        if glyph in s:
            s = s.replace(glyph, rep)
    # Strip any remaining unencodable characters
    s = s.encode("latin-1", "replace").decode("latin-1")
    return s


def generate_material_pdf_bytes(
    title: str,
    material_type: str,
    content_json_str: str,
) -> bytes:
    """
    Render a generated study material (summary, quiz, flashcards, exam, or reviewer) into a clean PDF via ReportLab.
    Safely sanitizes text for standard font encodings and persists a copy in settings.GENERATED_DIR.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=50,
        rightMargin=50,
        topMargin=50,
        bottomMargin=50,
        title=sanitize_text_for_pdf(title),
    )

    styles = getSampleStyleSheet()
    title_style = styles["Title"]
    heading_style = styles["Heading2"]
    subheading_style = styles["Heading3"]
    body_style = ParagraphStyle(
        "StudyBody",
        parent=styles["BodyText"],
        fontSize=10,
        leading=14,
        spaceAfter=6,
    )

    story = []
    clean_title = sanitize_text_for_pdf(title)
    story.append(Paragraph(escape(clean_title), title_style))
    story.append(
        Paragraph(
            escape(f"Studexa — {material_type.upper()} Study Material"),
            styles["Italic"],
        )
    )
    story.append(Spacer(1, 14))

    data = json.loads(content_json_str) if content_json_str else {}

    if material_type == "reviewer":
        rev = data.get("reviewer", {})
        
        # 1. Executive Synthesis
        story.append(Paragraph("Executive Synthesis & Conceptual Framework", heading_style))
        raw_summary = rev.get("executive_summary", "")
        summary_clean = sanitize_text_for_pdf(raw_summary)
        story.append(Paragraph(escape(summary_clean), body_style))
        story.append(Spacer(1, 10))

        # 2. Learning Objectives
        objectives = rev.get("learning_objectives", [])
        if objectives:
            story.append(Paragraph("Core Learning Objectives", heading_style))
            for obj in objectives:
                obj_clean = sanitize_text_for_pdf(obj)
                story.append(Paragraph(f"• {escape(obj_clean)}", body_style))
            story.append(Spacer(1, 10))

        # 3. Comprehensive Topic Breakdown
        topics = rev.get("topics", [])
        if topics:
            story.append(Paragraph("Comprehensive Topic & Module Breakdown", heading_style))
            for idx, top in enumerate(topics, start=1):
                top_title = sanitize_text_for_pdf(top.get("topic_title", f"Topic {idx}"))
                story.append(Paragraph(f"<b>{idx}. {escape(top_title)}</b>", subheading_style))
                for pt in top.get("bullet_points", []):
                    pt_clean = sanitize_text_for_pdf(pt)
                    story.append(Paragraph(f"&nbsp;&nbsp;&nbsp;• {escape(pt_clean)}", body_style))
                story.append(Spacer(1, 6))

        # 4. Key Terms Glossary
        key_terms = rev.get("key_terms", [])
        if key_terms:
            story.append(Spacer(1, 8))
            story.append(Paragraph("Key Terms & High-Yield Definitions", heading_style))
            for kt in key_terms:
                term = sanitize_text_for_pdf(kt.get("term", ""))
                defn = sanitize_text_for_pdf(kt.get("definition", ""))
                story.append(Paragraph(f"<b>{escape(term)}:</b> {escape(defn)}", body_style))

        # 5. Memory Aids, Mnemonics & Formulas
        memory_aids = rev.get("memory_aids", [])
        if memory_aids:
            story.append(Spacer(1, 8))
            story.append(Paragraph("Memory Aids, Formulas & Key Rules", heading_style))
            for aid in memory_aids:
                aid_clean = sanitize_text_for_pdf(aid)
                story.append(Paragraph(f"💡 {escape(aid_clean)}", body_style))

        # 6. Self-Check Examination Questions
        questions = rev.get("practice_questions", [])
        if questions:
            story.append(Spacer(1, 8))
            story.append(Paragraph("Practice Examination & Self-Check Questions", heading_style))
            for q_idx, q in enumerate(questions, start=1):
                q_clean = sanitize_text_for_pdf(q)
                story.append(Paragraph(f"<b>Q{q_idx}.</b> {escape(q_clean)}", body_style))

    elif material_type == "summary":
        summary = data.get("summary", {})
        story.append(Paragraph("Overview", heading_style))
        story.append(Paragraph(escape(sanitize_text_for_pdf(summary.get("overview", ""))), body_style))

        main_ideas = summary.get("main_ideas", [])
        if main_ideas:
            story.append(Paragraph("Main Ideas", heading_style))
            for item in main_ideas:
                story.append(Paragraph(f"• {escape(sanitize_text_for_pdf(item))}", body_style))

        key_terms = summary.get("key_terms", [])
        if key_terms:
            story.append(Paragraph("Key Terms & Definitions", heading_style))
            for kt in key_terms:
                term = escape(sanitize_text_for_pdf(kt.get("term", "")))
                defn = escape(sanitize_text_for_pdf(kt.get("definition", "")))
                story.append(Paragraph(f"<b>{term}:</b> {defn}", body_style))

        details = summary.get("important_details", [])
        if details:
            story.append(Paragraph("Important Details", heading_style))
            for d in details:
                story.append(Paragraph(f"• {escape(sanitize_text_for_pdf(d))}", body_style))

    elif material_type in ("quiz", "exam"):
        questions = data.get("questions", [])
        for idx, q in enumerate(questions):
            q_text = escape(sanitize_text_for_pdf(q.get("question", "")))
            q_type = q.get("question_type", "multiple_choice")
            type_label = f" [{q_type.replace('_', ' ').title()}]" if q_type != "multiple_choice" else ""
            story.append(
                Paragraph(
                    f"<b>Q{idx + 1}. {q_text}</b><i>{type_label}</i>",
                    body_style,
                )
            )
            opts = q.get("options", [])
            if opts:
                for opt_idx, opt in enumerate(opts):
                    letter_label = chr(65 + opt_idx)
                    story.append(
                        Paragraph(f"&nbsp;&nbsp;&nbsp;{letter_label}. {escape(sanitize_text_for_pdf(opt))}", body_style)
                    )
            elif q.get("expected_items"):
                story.append(
                    Paragraph(f"&nbsp;&nbsp;&nbsp;<i>(Enumerate {len(q['expected_items'])} items)</i>", body_style)
                )
            elif q.get("formula"):
                story.append(
                    Paragraph(f"&nbsp;&nbsp;&nbsp;<i>Formula Hint: {escape(sanitize_text_for_pdf(q['formula']))}</i>", body_style)
                )
            story.append(Spacer(1, 6))

        story.append(Spacer(1, 12))
        story.append(Paragraph("Answer Key & Explanations", heading_style))
        for idx, q in enumerate(questions):
            ans_display = ""
            if q.get("options") and isinstance(q.get("correct_index"), int):
                c_idx = int(q.get("correct_index", 0))
                letter_label = chr(65 + c_idx)
                ans_display = f"{letter_label} ({escape(sanitize_text_for_pdf(q['options'][c_idx])) if c_idx < len(q['options']) else ''})"
            elif q.get("correct_answer"):
                ans_display = escape(sanitize_text_for_pdf(q.get("correct_answer", "")))
            elif q.get("expected_items"):
                ans_display = ", ".join(escape(sanitize_text_for_pdf(i)) for i in q["expected_items"])

            expl = escape(sanitize_text_for_pdf(q.get("explanation", "")))
            story.append(
                Paragraph(f"<b>Q{idx + 1}: {ans_display}</b> — {expl}", body_style)
            )

    elif material_type == "flashcards":
        cards = data.get("cards", [])
        for idx, c in enumerate(cards):
            q_text = escape(sanitize_text_for_pdf(c.get("question", "")))
            a_text = escape(sanitize_text_for_pdf(c.get("answer", "")))
            story.append(Paragraph(f"<b>Card #{idx + 1} — Q:</b> {q_text}", body_style))
            story.append(Paragraph(f"<b>A:</b> {a_text}", body_style))
            story.append(Spacer(1, 8))

    doc.build(story)
    pdf_bytes = buffer.getvalue()

    gen_root = Path(settings.GENERATED_DIR).resolve()
    gen_root.mkdir(parents=True, exist_ok=True)

    return pdf_bytes
