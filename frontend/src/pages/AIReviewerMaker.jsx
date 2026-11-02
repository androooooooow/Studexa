import React, { useState } from 'react';
import {
  BookMarked,
  CheckCircle2,
  Copy,
  Download,
  FileCheck2,
  FileText,
  HelpCircle,
  Lightbulb,
  ListOrdered,
  Loader2,
  Presentation,
  Printer,
  Sparkles,
} from 'lucide-react';
import SourceDocumentSelector from '../components/study-tools/SourceDocumentSelector';
import { useSession } from '../hooks/useSession';
import {
  downloadMaterialPdf,
  formatApiError,
  generateReviewer,
  pollJobUntilDone,
} from '../services/api';

const REVIEWER_MODES = [
  {
    id: 'standard',
    label: 'Standard Reviewer',
    description: 'Balanced chapter review with objectives, key topics, and term definitions.',
  },
  {
    id: 'exam_focused',
    label: 'Exam Cram Reviewer',
    description: 'High-yield memory aids, critical formulas, and high-frequency exam points.',
  },
  {
    id: 'in_depth',
    label: 'Comprehensive Syllabus',
    description: 'Deep exhaustive breakdown across all slides or chapter chunks.',
  },
];

export default function AIReviewerMaker() {
  const { activeDocumentId, activeDocument, refreshSession } = useSession();
  const [selectedDocId, setSelectedDocId] = useState(activeDocumentId || '');
  const [mode, setMode] = useState('standard');
  const [jobState, setJobState] = useState(null);
  const [currentReviewer, setCurrentReviewer] = useState(null);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync selected doc when session activeDocumentId changes
  React.useEffect(() => {
    if (activeDocumentId && !selectedDocId) {
      setSelectedDocId(activeDocumentId);
    }
  }, [activeDocumentId, selectedDocId]);

  const handleGenerate = async () => {
    if (!selectedDocId || jobState) return;
    setError(null);
    setCurrentReviewer(null);
    setJobState({ status: 'queued', queue_position: 1 });

    try {
      const job = await generateReviewer({
        document_id: selectedDocId,
        mode,
      });

      setJobState(job);
      const finishedJob = await pollJobUntilDone(job.id, (u) => setJobState(u));

      // Extract generated reviewer payload
      let result = finishedJob.result;
      if (typeof result === 'string') {
        try {
          result = JSON.parse(result);
        } catch {
          // Keep as string
        }
      }

      const revContent =
        result?.content ||
        result?.reviewer ||
        result?.summary ||
        result;

      setCurrentReviewer({
        material_id: result?.material_id,
        title: result?.title || `${activeDocument?.original_filename || 'Lecture'} — Study Reviewer`,
        mode: result?.mode || mode,
        data: revContent,
      });

      await refreshSession();
    } catch (err) {
      setError(formatApiError(err, 'Failed to generate study reviewer.'));
    } finally {
      setJobState(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (!currentReviewer?.material_id) return;
    setDownloading(true);
    try {
      await downloadMaterialPdf(
        currentReviewer.material_id,
        `${currentReviewer.title || 'Studexa_Reviewer'}.pdf`
      );
    } catch (err) {
      setError(formatApiError(err, 'Could not export reviewer PDF.'));
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    if (!currentReviewer?.data) return;
    const d = currentReviewer.data;
    const textLines = [
      currentReviewer.title,
      '=' .repeat(50),
      '',
      'EXECUTIVE SUMMARY:',
      d.executive_summary || d.overview || '',
      '',
    ];

    if (d.learning_objectives?.length) {
      textLines.push('LEARNING OBJECTIVES:');
      d.learning_objectives.forEach((lo) => textLines.push(`• ${lo}`));
      textLines.push('');
    }

    if (d.topics?.length) {
      textLines.push('TOPIC BREAKDOWN:');
      d.topics.forEach((t) => {
        textLines.push(`\n[${t.topic_title || 'Topic'}]`);
        (t.bullet_points || []).forEach((bp) => textLines.push(`  • ${bp}`));
      });
      textLines.push('');
    }

    if (d.key_terms?.length) {
      textLines.push('KEY TERMS & DEFINITIONS:');
      d.key_terms.forEach((kt) => textLines.push(`• ${kt.term}: ${kt.definition}`));
      textLines.push('');
    }

    if (d.memory_aids?.length) {
      textLines.push('MEMORY AIDS & QUICK FORMULAS:');
      d.memory_aids.forEach((ma) => textLines.push(`💡 ${ma}`));
      textLines.push('');
    }

    if (d.practice_questions?.length) {
      textLines.push('SELF-CHECK QUESTIONS:');
      d.practice_questions.forEach((q, i) => textLines.push(`Q${i + 1}. ${q}`));
      textLines.push('');
    }

    navigator.clipboard.writeText(textLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const reviewerData = currentReviewer?.data;

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-indigo-800 p-6 text-white shadow-md sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-blue-100 backdrop-blur-xs">
              <Presentation className="h-3.5 w-3.5 text-amber-300" />
              <span>PDF • PPTX/PPT • DOCX to Printable Study Reviewer</span>
            </div>
            <h1 className="mt-3 font-display text-2xl font-extrabold sm:text-3xl">
              AI Study Reviewer Maker
            </h1>
            <p className="mt-1 text-xs text-blue-100/90 sm:text-sm">
              Upload your lecture slides or textbooks, convert them into a structured exam reviewer, and download as a clean printable PDF.
            </p>
          </div>
        </div>
      </div>

      {/* Configuration & Generator Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs sm:p-8">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Document Picker with Direct Uploader */}
          <div className="space-y-4 lg:col-span-7">
            <SourceDocumentSelector
              label="Select Source Slide Deck or Lecture Note"
              valueOverride={selectedDocId}
              onChangeOverride={(id) => setSelectedDocId(id)}
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Reviewer Mode
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {REVIEWER_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      mode === m.id
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-bold">{m.label}</p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">
                      {m.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Button & Status */}
          <div className="flex flex-col justify-between rounded-xl bg-slate-50/80 p-5 lg:col-span-5">
            <div>
              <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase">
                Ready to Synthesize
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Gemma 3 1B will scan through your slides/chunks, extract key concepts, format learning objectives, and assemble an exam-ready reviewer with memory aids.
              </p>
            </div>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!selectedDocId || !!jobState}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {jobState ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      Synthesizing Reviewer ({jobState.status}
                      {jobState.queue_position ? ` • Pos #${jobState.queue_position}` : ''})…
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    <span>Generate Complete Reviewer</span>
                  </>
                )}
              </button>

              <p className="text-center text-[11px] text-slate-400">
                100% Local AI • No Cloud Telemetry • One-Click PDF Export
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
            {error}
          </div>
        )}
      </div>

      {/* Generated Reviewer Display */}
      {reviewerData && (
        <div className="space-y-6">
          {/* Top Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {currentReviewer.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Grounded in uploaded document • Ready to study &amp; print
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print</span>
              </button>

              {currentReviewer.material_id && (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span>Download Reviewer PDF</span>
                </button>
              )}
            </div>
          </div>

          {/* Reviewer Content Cards */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left 8 Cols: Synthesis, Objectives & Topic Breakdowns */}
            <div className="space-y-6 lg:col-span-8">
              {/* Executive Summary */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
                <h4 className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  <span>Executive Synthesis</span>
                </h4>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-700">
                  {reviewerData.executive_summary || reviewerData.overview || 'Overview generated from source.'}
                </p>
              </div>

              {/* Learning Objectives */}
              {reviewerData.learning_objectives?.length > 0 && (
                <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
                  <h4 className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
                    <ListOrdered className="h-4 w-4 text-blue-600" />
                    <span>Key Learning Objectives</span>
                  </h4>
                  <ul className="mt-3 space-y-2 text-xs text-slate-700">
                    {reviewerData.learning_objectives.map((obj, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{obj}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Topic Breakdown */}
              {reviewerData.topics?.length > 0 && (
                <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
                  <h4 className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
                    <BookMarked className="h-4 w-4 text-violet-600" />
                    <span>Detailed Topic Breakdown</span>
                  </h4>
                  <div className="mt-4 space-y-4">
                    {reviewerData.topics.map((t, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 transition hover:bg-slate-50"
                      >
                        <h5 className="text-xs font-bold text-slate-900">
                          {t.topic_title || `Topic ${idx + 1}`}
                        </h5>
                        <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                          {(t.bullet_points || []).map((bp, bIdx) => (
                            <li key={bIdx} className="flex items-start gap-2">
                              <span className="text-indigo-500">•</span>
                              <span className="leading-relaxed">{bp}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Self Check Questions */}
              {reviewerData.practice_questions?.length > 0 && (
                <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
                  <h4 className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
                    <HelpCircle className="h-4 w-4 text-amber-600" />
                    <span>Quick Self-Check Questions</span>
                  </h4>
                  <div className="mt-3 space-y-2.5">
                    {reviewerData.practice_questions.map((q, qIdx) => (
                      <div
                        key={qIdx}
                        className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 text-xs text-slate-800"
                      >
                        <span className="font-bold text-amber-900">Q{qIdx + 1}.</span>{' '}
                        {q}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right 4 Cols: Key Terms & Memory Aids */}
            <div className="space-y-6 lg:col-span-4">
              {/* Memory Aids */}
              {reviewerData.memory_aids?.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 shadow-2xs">
                  <h4 className="flex items-center gap-2 font-display text-sm font-bold text-amber-900">
                    <Lightbulb className="h-4 w-4 text-amber-600" />
                    <span>Memory Aids &amp; Formulas</span>
                  </h4>
                  <div className="mt-3 space-y-2.5">
                    {reviewerData.memory_aids.map((aid, aIdx) => (
                      <div
                        key={aIdx}
                        className="rounded-xl bg-white p-3 text-xs leading-relaxed font-medium text-amber-950 shadow-2xs"
                      >
                        💡 {aid}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Terms */}
              {reviewerData.key_terms?.length > 0 && (
                <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
                  <h4 className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
                    <Sparkles className="h-4 w-4 text-emerald-600" />
                    <span>Key Terms ({reviewerData.key_terms.length})</span>
                  </h4>
                  <div className="mt-3 space-y-2.5">
                    {reviewerData.key_terms.map((kt, kIdx) => (
                      <div
                        key={kIdx}
                        className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                      >
                        <p className="font-bold text-slate-900">{kt.term}</p>
                        <p className="mt-1 leading-relaxed text-slate-600">
                          {kt.definition}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
