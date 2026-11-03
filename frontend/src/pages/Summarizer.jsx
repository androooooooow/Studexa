import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Download,
  Loader2,
  Sparkles,
} from 'lucide-react';
import SourceDocumentSelector from '../components/study-tools/SourceDocumentSelector';
import { useSession } from '../hooks/useSession';
import {
  downloadMaterialPdf,
  fetchSummaries,
  formatApiError,
  generateSummary,
  pollJobUntilDone,
} from '../services/api';

const STYLES = [
  {
    id: 'short',
    label: 'Short Overview',
    desc: 'Quick high-level bullet points & core thesis',
  },
  {
    id: 'medium',
    label: 'Medium Study Guide',
    desc: 'Main ideas, key terms, and structured takeaways',
  },
  {
    id: 'detailed',
    label: 'Detailed Breakdown',
    desc: 'Comprehensive section-by-section notes & definitions',
  },
];

export default function Summarizer() {
  const { activeDocumentId, refreshSession } = useSession();
  const [style, setStyle] = useState('medium');
  const [summaries, setSummaries] = useState([]);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [jobState, setJobState] = useState(null);
  const [error, setError] = useState(null);

  const loadSummaries = useCallback(async () => {
    try {
      const list = await fetchSummaries();
      setSummaries(list);
      setSelectedSummary((prev) => prev || list[0] || null);
    } catch {
      // Ignore load errors
    }
  }, []);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  const handleGenerate = async () => {
    if (!activeDocumentId || jobState) return;
    setError(null);
    setJobState({ status: 'queued', queue_position: 1 });

    try {
      const job = await generateSummary({ document_id: activeDocumentId, style });
      setJobState(job);
      const completedJob = await pollJobUntilDone(job.id, (updated) => setJobState(updated));
      const res = completedJob?.result;
      if (res && res.content) {
        const immediateSummary = {
          id: res.material_id || res.id,
          document_id: res.document_id || activeDocumentId,
          title: res.title || 'Generated Summary',
          style: res.style || style,
          source_chunks_used: res.source_chunks_used || [],
          content: res.content,
          created_at: res.created_at || new Date().toISOString(),
        };
        setSelectedSummary(immediateSummary);
        setSummaries((prev) => [
          immediateSummary,
          ...prev.filter((s) => s.id !== immediateSummary.id),
        ]);
      }
      const updatedList = await fetchSummaries();
      if (updatedList.length > 0) {
        setSummaries(updatedList);
        const matched =
          (res?.material_id && updatedList.find((s) => s.id === res.material_id)) ||
          updatedList[0];
        setSelectedSummary(matched);
      }
      await refreshSession();
    } catch (err) {
      setError(formatApiError(err, 'Failed to generate summary.'));
    } finally {
      setJobState(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Configuration & History Panel */}
      <div className="space-y-6 lg:col-span-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
          <h2 className="font-display text-base font-bold text-slate-900">Summary Settings</h2>
          <p className="mt-1 text-xs text-slate-500">
            Summaries are strictly grounded in your selected document excerpts.
          </p>

          <div className="mt-5">
            <SourceDocumentSelector />
          </div>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Summary Depth</label>
            <div className="mt-2 space-y-2">
              {STYLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStyle(item.id)}
                  className={`flex w-full flex-col items-start rounded-xl border p-3.5 text-left transition ${
                    style === item.id
                      ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className="text-xs font-bold text-slate-900">{item.label}</span>
                  <span className="mt-0.5 text-[11px] text-slate-500">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!activeDocumentId || Boolean(jobState)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {jobState ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {jobState.status === 'queued'
                    ? `Queued (Position #${jobState.queue_position || 1})…`
                    : 'Generating with Gemma 3 1B…'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Generate {style} Summary</span>
              </>
            )}
          </button>
        </div>

        {/* Saved Summaries List */}
        {summaries.length > 0 && (
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Saved Summaries ({summaries.length})
            </h3>
            <div className="mt-3 space-y-2">
              {summaries.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedSummary(item)}
                  className={`flex w-full flex-col items-start rounded-xl border p-3 text-left transition ${
                    selectedSummary?.id === item.id
                      ? 'border-indigo-600 bg-indigo-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="line-clamp-1 text-xs font-bold text-slate-900">
                    {item.title}
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Summary Output Reader */}
      <div className="lg:col-span-8">
        {!selectedSummary ? (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-2xs">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
              <BookOpen className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-slate-900">
              Structured Study Summary Reader
            </h3>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
              Select an uploaded document and click Generate Summary to view Main Ideas, Key Terms
              &amp; Definitions, and Important Details grounded in your source text.
            </p>
          </div>
        ) : (
          <div className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold uppercase text-violet-700">
                    {selectedSummary.style} Summary
                  </span>
                  {selectedSummary.source_chunks_used?.length > 0 && (
                    <span className="text-xs font-medium text-slate-500">
                      Verified Sections:{' '}
                      {selectedSummary.source_chunks_used.map((c) => `§${c}`).join(', ')}
                    </span>
                  )}
                </div>
                <h2 className="mt-2 font-display text-xl font-bold text-slate-900">
                  {selectedSummary.title}
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  downloadMaterialPdf(selectedSummary.id, selectedSummary.title)
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5 text-indigo-600" />
                <span>Export PDF</span>
              </button>
            </div>

            {selectedSummary.content.insufficient_source_note && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                <strong>Source Coverage Note:</strong>{' '}
                {selectedSummary.content.insufficient_source_note}
              </div>
            )}

            <div>
              <h3 className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
                Overview
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {selectedSummary.content.overview}
              </p>
            </div>

            {selectedSummary.content.main_ideas?.length > 0 && (
              <div>
                <h3 className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
                  Main Ideas
                </h3>
                <ul className="mt-2.5 space-y-2 text-sm text-slate-700">
                  {selectedSummary.content.main_ideas.map((idea, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
                      <span>{idea}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedSummary.content.key_terms?.length > 0 && (
              <div>
                <h3 className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
                  Key Terms &amp; Definitions
                </h3>
                <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                  {selectedSummary.content.key_terms.map((kt, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5"
                    >
                      <p className="text-xs font-bold text-slate-900">{kt.term}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        {kt.definition}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedSummary.content.important_details?.length > 0 && (
              <div>
                <h3 className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
                  Important Details
                </h3>
                <ul className="mt-2.5 space-y-2 text-sm text-slate-700">
                  {selectedSummary.content.important_details.map((detail, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
