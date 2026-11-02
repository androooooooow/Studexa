import io
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from app.config import settings


def generate_material_pdf_bytes(
    title: str,
    material_type: str,
    content_json_str: str,
) -> bytes:
    """
    Render a generated study material (summary, quiz, flashcards, or exam) into a clean PDF via ReportLab.
    Also saves a copy in settings.GENERATED_DIR using a safe filename if needed.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=50,
        rightMargin=50,
        topMargin=50,
        bottomMargin=50,
        title=title,
    )

    styles = getSampleStyleSheet()
    title_style = styles["Title"]
    heading_style = styles["Heading2"]
    body_style = ParagraphStyle(
        "StudyBody",
        parent=styles["BodyText"],
        fontSize=10,
        leading=14,
        spaceAfter=6,
    )

    story = []
    story.append(Paragraph(escape(title), title_style))
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
        story.append(Paragraph("Executive Summary", heading_style))
        story.append(Paragraph(escape(rev.get("executive_summary", "")), body_style))
        story.append(Spacer(1, 10))

        objectives = rev.get("learning_objectives", [])
        if objectives:
            story.append(Paragraph("Learning Objectives", heading_style))
            for obj in objectives:
                story.append(Paragraph(f"• {escape(str(obj))}", body_style))
            story.append(Spacer(1, 10))

        topics = rev.get("topics", [])
        if topics:
            story.append(Paragraph("Comprehensive Topic Breakdown", heading_style))
            for top in topics:
                top_title = escape(str(top.get("topic_title", "Topic")))
                story.append(Paragraph(f"<b>{top_title}</b>", body_style))
                for pt in top.get("bullet_points", []):
                    story.append(Paragraph(f"&nbsp;&nbsp;&nbsp;• {escape(str(pt))}", body_style))
                story.append(Spacer(1, 6))

        key_terms = rev.get("key_terms", [])
        if key_terms:
            story.append(Spacer(1, 8))
            story.append(Paragraph("Key Terms & High-Yield Definitions", heading_style))
            for kt in key_terms:
                term = escape(str(kt.get("term", "")))
                defn = escape(str(kt.get("definition", "")))
                story.append(Paragraph(f"<b>{term}:</b> {defn}", body_style))

        memory_aids = rev.get("memory_aids", [])
        if memory_aids:
            story.append(Spacer(1, 8))
            story.append(Paragraph("Memory Aids & Quick Formulas", heading_style))
            for aid in memory_aids:
                story.append(Paragraph(f"💡 {escape(str(aid))}", body_style))

        questions = rev.get("practice_questions", [])
        if questions:
            story.append(Spacer(1, 8))
            story.append(Paragraph("Quick Self-Check Questions", heading_style))
            for q_idx, q in enumerate(questions, start=1):
                story.append(Paragraph(f"<b>Q{q_idx}.</b> {escape(str(q))}", body_style))

    elif material_type == "summary":
        summary = data.get("summary", {})
        story.append(Paragraph("Overview", heading_style))
        story.append(Paragraph(escape(summary.get("overview", "")), body_style))

        main_ideas = summary.get("main_ideas", [])
        if main_ideas:
            story.append(Paragraph("Main Ideas", heading_style))
            for item in main_ideas:
                story.append(Paragraph(f"• {escape(str(item))}", body_style))

        key_terms = summary.get("key_terms", [])
        if key_terms:
            story.append(Paragraph("Key Terms & Definitions", heading_style))
            for kt in key_terms:
                term = escape(str(kt.get("term", "")))
                defn = escape(str(kt.get("definition", "")))
                story.append(Paragraph(f"<b>{term}:</b> {defn}", body_style))

        details = summary.get("important_details", [])
        if details:
            story.append(Paragraph("Important Details", heading_style))
            for d in details:
                story.append(Paragraph(f"• {escape(str(d))}", body_style))

    elif material_type in ("quiz", "exam"):
        questions = data.get("questions", [])
        for idx, q in enumerate(questions):
            story.append(
                Paragraph(
                    f"<b>Q{idx + 1}. {escape(str(q.get('question', '')))}</b>",
                    body_style,
                )
            )
            for opt_idx, opt in enumerate(q.get("options", [])):
                letter_label = chr(65 + opt_idx)
                story.append(
                    Paragraph(f"&nbsp;&nbsp;&nbsp;{letter_label}. {escape(str(opt))}", body_style)
                )
            story.append(Spacer(1, 6))

        story.append(Spacer(1, 12))
        story.append(Paragraph("Answer Key & Explanations", heading_style))
        for idx, q in enumerate(questions):
            c_idx = int(q.get("correct_index", 0))
            letter_label = chr(65 + c_idx)
            expl = escape(str(q.get("explanation", "")))
            story.append(
                Paragraph(f"<b>Q{idx + 1}: {letter_label}</b> — {expl}", body_style)
            )

    elif material_type == "flashcards":
        cards = data.get("cards", [])
        for idx, c in enumerate(cards):
            q_text = escape(str(c.get("question", "")))
            a_text = escape(str(c.get("answer", "")))
            story.append(Paragraph(f"<b>Card #{idx + 1} — Q:</b> {q_text}", body_style))
            story.append(Paragraph(f"<b>A:</b> {a_text}", body_style))
            story.append(Spacer(1, 8))

    doc.build(story)
    pdf_bytes = buffer.getvalue()

    # Persist inside GENERATED_DIR safely
    gen_root = Path(settings.GENERATED_DIR).resolve()
    gen_root.mkdir(parents=True, exist_ok=True)

    return pdf_bytes
