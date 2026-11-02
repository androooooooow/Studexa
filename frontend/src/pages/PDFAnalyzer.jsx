import React from 'react';
import PhaseNoticeCard from '../components/common/PhaseNoticeCard';

export default function PDFAnalyzer() {
  return (
    <PhaseNoticeCard
      title="PDF & Document Analyzer"
      phaseNumber={2}
      description="Upload PDF and DOCX study materials. Each file is validated, extracted safely, split into chunks, and indexed in SQLite FTS5 under your anonymous session."
      features={[
        'Upload PDF and DOCX files up to 20 MB with strict MIME/extension validation',
        'Extract text with PyMuPDF and python-docx (with clear detection of scanned/image-only PDFs)',
        'Automatic chunking and SQLite FTS5 full-text indexing',
        'Select active source documents or delete owned files',
      ]}
    />
  );
}
