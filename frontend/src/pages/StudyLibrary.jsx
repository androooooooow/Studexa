import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Library, Plus } from 'lucide-react';

const TABS = [
  { id: 'all', label: 'All Items' },
  { id: 'documents', label: 'Documents' },
  { id: 'summaries', label: 'Summaries' },
  { id: 'quizzes', label: 'Quizzes' },
  { id: 'flashcards', label: 'Flashcards' },
];

export default function StudyLibrary() {
  const [activeTab, setActiveTab] = useState('all');

  return (
    <div className="space-y-6">
      {/* Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Link
          to="/documents"
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Upload New File</span>
        </Link>
      </div>

      {/* Library Grid / Empty State */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-2xs">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <FolderOpen className="h-6 w-6" />
          </div>
          <h3 className="mt-4 font-display text-base font-bold text-slate-900">
            Your Study Library is Empty
          </h3>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            All documents you upload and study aids you generate in this browser session are stored
            privately here for quick review, PDF export, or deletion.
          </p>
          <Link
            to="/documents"
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Upload First Document</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
