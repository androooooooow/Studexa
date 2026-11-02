import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';

export default function PhaseNoticeCard({ title, phaseNumber, description, features }) {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
          <Clock className="h-3.5 w-3.5" />
          <span>Scheduled for Phase {phaseNumber}</span>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>

        {features?.length > 0 && (
          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <h2 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              Planned Capabilities in Phase {phaseNumber}
            </h2>
            <ul className="mt-2.5 space-y-2 text-sm text-slate-700">
              {features.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
