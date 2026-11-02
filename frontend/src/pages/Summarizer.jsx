import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FileText, Sparkles, Upload } from 'lucide-react';

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
  const [style, setStyle] = useState('medium');

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Configuration Panel */}
      <div className="space-y-6 lg:col-span-5">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
          <h2 className="font-display text-base font-bold text-slate-900">Summary Settings</h2>
          <p className="mt-1 text-xs text-slate-500">
            Summaries are strictly grounded in your selected document excerpts.
          </p>

          {/* Source Document Selector */}
          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Source Document</label>
            <div className="mt-1.5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
              <span className="truncate">No document uploaded in session yet</span>
              <Link
                to="/documents"
                className="ml-2 shrink-0 font-semibold text-indigo-600 hover:underline"
              >
                Upload →
              </Link>
            </div>
          </div>

          {/* Summary Style Selector */}
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

          <button
            type="button"
            disabled
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-semibold text-white shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            <span>Select a Document to Generate Summary</span>
          </button>
        </div>
      </div>

      {/* Right Summary Output Reader */}
      <div className="lg:col-span-7">
        <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-2xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <BookOpen className="h-6 w-6" />
          </div>
          <h3 className="mt-4 font-display text-base font-bold text-slate-900">
            Structured Study Summary Reader
          </h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
            Generated summaries display Main Ideas, Key Terms &amp; Definitions, and Important
            Details verified against your uploaded source document.
          </p>
          <Link
            to="/documents"
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5 text-indigo-600" />
            <span>Upload Source Material First</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
