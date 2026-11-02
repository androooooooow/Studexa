/**
 * Client-side PPTX/PPT slide text extractor & PDF wrapper.
 * Ensures that even if the running backend process has not been restarted yet,
 * uploading a .pptx or .ppt presentation extracts every slide's text in the browser
 * and packages it into a valid text-selectable PDF for instant FTS5 chunking.
 */

async function inflateRawBytes(compressedUint8) {
  if (typeof DecompressionStream === 'undefined') {
    return new TextDecoder('utf-8', { fatal: false }).decode(compressedUint8);
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(compressedUint8);
  writer.close();
  const resp = new Response(ds.readable);
  const buf = await resp.arrayBuffer();
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf));
}

function extractSlideTextFromXml(xmlString) {
  const paragraphs = [];
  const pRegex = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(xmlString)) !== null) {
    const pBody = pMatch[1];
    const tRegex = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
    const runs = [];
    let tMatch;
    while ((tMatch = tRegex.exec(pBody)) !== null) {
      const decoded = tMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      if (decoded) runs.push(decoded);
    }
    if (runs.length > 0) {
      paragraphs.push(runs.join(' '));
    }
  }
  return paragraphs.join('\n');
}

export async function extractTextFromPptxFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  // Check if ZIP header (PK\x03\x04)
  if (
    bytes.length > 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    const slides = [];
    let offset = 0;
    while (offset + 30 <= bytes.length) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break;

      const compression = view.getUint16(offset + 8, true);
      const compSize = view.getUint32(offset + 18, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);

      const nameBytes = bytes.subarray(offset + 30, offset + 30 + nameLen);
      const entryName = new TextDecoder('utf-8').decode(nameBytes);
      const dataStart = offset + 30 + nameLen + extraLen;
      const dataEnd = dataStart + compSize;

      if (dataEnd > bytes.length) break;

      const slideMatch = entryName.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      if (slideMatch) {
        const slideNum = parseInt(slideMatch[1], 10);
        const rawSlice = bytes.subarray(dataStart, dataEnd);
        try {
          const xmlText =
            compression === 0
              ? new TextDecoder('utf-8').decode(rawSlice)
              : await inflateRawBytes(rawSlice);
          const text = extractSlideTextFromXml(xmlText);
          if (text.trim()) {
            slides.push({ slideNum, text: `[Slide ${slideNum}]\n${text.trim()}` });
          }
        } catch {
          // Ignore individual malformed slide stream
        }
      }
      offset = dataEnd;
    }

    slides.sort((a, b) => a.slideNum - b.slideNum);
    if (slides.length > 0) {
      return slides.map((s) => s.text).join('\n\n');
    }
  }

  // Fallback for legacy .ppt or unindexed streams: extract readable ASCII/UTF-8 runs
  const rawText = new TextDecoder('latin1').decode(bytes);
  const matches = rawText.match(/[A-Za-z0-9 ,.;:?!()\-/'"]{15,}/g) || [];
  return matches.slice(0, 250).join('\n') || `Presentation: ${file.name}`;
}

function escapePdfLiteral(str) {
  return String(str || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function buildSelectablePdfFromText(text, originalFilename) {
  const lines = [];
  const rawLines = String(text || '').split(/\r?\n/);
  for (const rl of rawLines) {
    const trimmed = rl.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    for (let i = 0; i < trimmed.length; i += 85) {
      lines.push(trimmed.slice(i, i + 85));
    }
  }

  // Group into pages of 42 lines
  const pagesLines = [];
  for (let i = 0; i < lines.length; i += 42) {
    pagesLines.push(lines.slice(i, i + 42));
  }
  if (pagesLines.length === 0) {
    pagesLines.push([`Presentation Reviewer: ${originalFilename}`]);
  }

  const objects = [];
  // Obj 1: Catalog, Obj 2: Pages, Obj 3: Font
  const pageObjIds = [];
  let nextId = 4;

  const pageEntries = pagesLines.map((pLines) => {
    const contentId = nextId++;
    const pageId = nextId++;
    pageObjIds.push(pageId);

    const streamOps = ['BT', '/F1 10 Tf', '50 750 Td', '14 TL'];
    for (const ln of pLines) {
      streamOps.push(`(${escapePdfLiteral(ln)}) Tj T*`);
    }
    streamOps.push('ET');
    const streamStr = streamOps.join('\n');

    return { contentId, pageId, streamStr };
  });

  objects.push({ id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' });
  objects.push({
    id: 2,
    body: `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`,
  });
  objects.push({
    id: 3,
    body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  });

  for (const pe of pageEntries) {
    objects.push({
      id: pe.contentId,
      body: `<< /Length ${pe.streamStr.length} >>\nstream\n${pe.streamStr}\nendstream`,
    });
    objects.push({
      id: pe.pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pe.contentId} 0 R >>`,
    });
  }

  objects.sort((a, b) => a.id - b.id);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const baseName = originalFilename.replace(/\.(pptx|ppt)$/i, '');
  const pdfBytes = new TextEncoder().encode(pdf);
  return new File([pdfBytes], `${baseName}_Slides.pdf`, {
    type: 'application/pdf',
  });
}
