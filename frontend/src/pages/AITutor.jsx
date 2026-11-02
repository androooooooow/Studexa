import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, MessageSquare, Send, ShieldCheck } from 'lucide-react';

export default function AITutor() {
  const [question, setQuestion] = useState('');

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[500px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
      {/* Top Document Context Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900">Document-Grounded AI Study Tutor</p>
            <p className="text-[11px] text-slate-500">
              Retrieves relevant chunks via SQLite FTS5 before generating answers
            </p>
          </div>
        </div>
        <Link
          to="/documents"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-slate-50"
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>Select Source Document</span>
        </Link>
      </div>

      {/* Chat Transcript Area */}
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xs font-bold text-white">
            AI
          </div>
          <div className="max-w-2xl rounded-2xl rounded-tl-xs border border-slate-200/80 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
            <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <ShieldCheck className="h-3 w-3" />
              Source-Grounded Mode
            </div>
            <p>
              Hello! Upload and select a course document in the{' '}
              <Link to="/documents" className="font-semibold text-indigo-600 underline">
                PDF &amp; Doc Analyzer
              </Link>{' '}
              to ask questions about your study material. I will cite retrieved document chunks and
              clearly label if any part of an answer comes from general knowledge.
            </p>
          </div>
        </div>
      </div>

      {/* Message Composer */}
      <form
        onSubmit={(e) => e.preventDefault()}
        className="border-t border-slate-100 bg-white p-4"
      >
        <div className="flex items-center gap-2.5">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Upload a document first to ask the AI Tutor a question…"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
          />
          <button
            type="submit"
            disabled
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Ask</span>
          </button>
        </div>
      </form>
    </div>
  );
}
