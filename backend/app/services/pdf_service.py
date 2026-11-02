import io
import re
from typing import List, Tuple
import xml.etree.ElementTree as ET
import zipfile
import fitz  # PyMuPDF
import docx


SCANNED_PDF_MESSAGE = (
    "This PDF appears to be scanned or image-only (no selectable text was found). "
    "OCR is not included in version 1.0—please upload a text-selectable PDF or DOCX file."
)


def extract_text_from_pdf_bytes(content: bytes) -> Tuple[str, str]:
    """
    Extract text from PDF bytes using PyMuPDF.
    Returns (full_text, status) where status is 'completed' or 'scanned_no_ocr'.
    """
    pages_text: List[str] = []
    with fitz.open(stream=content, filetype="pdf") as pdf_doc:
        if pdf_doc.page_count == 0:
            return "", "scanned_no_ocr"
        for page_num in range(pdf_doc.page_count):
            page = pdf_doc.load_page(page_num)
            raw_page_text = page.get_text("text") or ""
            cleaned = raw_page_text.strip()
            if cleaned:
                pages_text.append(f"[Page {page_num + 1}]\n{cleaned}")

    combined = "\n\n".join(pages_text).strip()
    alpha_count = sum(1 for ch in combined if ch.isalnum())
    if alpha_count < 20:
        return "", "scanned_no_ocr"

    return combined, "completed"


def extract_text_from_docx_bytes(content: bytes) -> Tuple[str, str]:
    """
    Extract text from DOCX bytes using python-docx (paragraphs + tables).
    Returns (full_text, status) where status is 'completed' or 'empty_document'.
    """
    doc = docx.Document(io.BytesIO(content))
    blocks: List[str] = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            blocks.append(text)

    for table in doc.tables:
        for row in table.rows:
            row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if row_cells:
                blocks.append(" | ".join(row_cells))

    combined = "\n\n".join(blocks).strip()
    alpha_count = sum(1 for ch in combined if ch.isalnum())
    if alpha_count < 10:
        return "", "empty_document"

    return combined, "completed"


def extract_text_from_pptx_bytes(content: bytes) -> Tuple[str, str]:
    """
    Extract slide text and speaker notes from PPTX (OpenXML ZIP) or PPT bytes.
    Returns (full_text, status) where status is 'completed' or 'empty_document'.
    """
    slides_text: List[str] = []

    if content.startswith(b"PK\x03\x04"):
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            slide_names = [
                name
                for name in zf.namelist()
                if re.match(r"^ppt/slides/slide\d+\.xml$", name)
            ]
            slide_names.sort(
                key=lambda n: int(re.search(r"slide(\d+)\.xml$", n).group(1))
            )

            for idx, slide_name in enumerate(slide_names, start=1):
                xml_bytes = zf.read(slide_name)
                root = ET.fromstring(xml_bytes)
                paragraphs: List[str] = []
                for elem in root.iter():
                    if elem.tag.endswith("}p"):
                        runs = [
                            t_elem.text.strip()
                            for t_elem in elem.iter()
                            if t_elem.tag.endswith("}t") and t_elem.text and t_elem.text.strip()
                        ]
                        if runs:
                            paragraphs.append(" ".join(runs))
                if paragraphs:
                    slides_text.append(f"[Slide {idx}]\n" + "\n".join(paragraphs))

                # Also check speaker notes if present
                notes_name = f"ppt/notesSlides/notesSlide{idx}.xml"
                if notes_name in zf.namelist():
                    try:
                        n_root = ET.fromstring(zf.read(notes_name))
                        n_runs = [
                            t_elem.text.strip()
                            for t_elem in n_root.iter()
                            if t_elem.tag.endswith("}t") and t_elem.text and t_elem.text.strip()
                        ]
                        if n_runs:
                            slides_text.append(f"[Slide {idx} Notes]\n" + " ".join(n_runs))
                    except Exception:
                        pass
    else:
        # Legacy .ppt fallback: try PyMuPDF or printable text extraction
        try:
            with fitz.open(stream=content, filetype="pptx") as ppt_doc:
                for page_num in range(ppt_doc.page_count):
                    txt = (ppt_doc.load_page(page_num).get_text("text") or "").strip()
                    if txt:
                        slides_text.append(f"[Slide {page_num + 1}]\n{txt}")
        except Exception:
            decoded = content.decode("latin-1", errors="ignore")
            ascii_runs = re.findall(r"[A-Za-z0-9 ,.;:?!()\-'\"]{12,}", decoded)
            if ascii_runs:
                slides_text.append("[Slide Content]\n" + "\n".join(ascii_runs[:200]))

    combined = "\n\n".join(slides_text).strip()
    alpha_count = sum(1 for ch in combined if ch.isalnum())
    if alpha_count < 10:
        return "", "empty_document"

    return combined, "completed"


def split_text_into_chunks(
    text: str, chunk_size: int = 1200, overlap: int = 150
) -> List[str]:
    """
    Split extracted document text into manageable chunks while respecting paragraph/sentence boundaries.
    """
    normalized = re.sub(r"\n{3,}", "\n\n", text or "").strip()
    if not normalized:
        return []

    if len(normalized) <= chunk_size:
        return [normalized]

    chunks: List[str] = []
    start = 0
    length = len(normalized)

    while start < length:
        end = min(start + chunk_size, length)
        if end < length:
            # Prefer breaking at a paragraph or sentence boundary in the latter half of the chunk
            window = normalized[start:end]
            half = len(window) // 2
            break_pos = -1
            for sep in ("\n\n", ".\n", ". ", "\n", " "):
                pos = window.rfind(sep, half)
                if pos != -1:
                    break_pos = start + pos + len(sep)
                    break
            if break_pos > start:
                end = break_pos

        chunk = normalized[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= length:
            break

        next_start = max(end - overlap, start + 1)
        start = next_start

    return chunks
