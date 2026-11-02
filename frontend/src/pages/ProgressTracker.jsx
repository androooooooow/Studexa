import React from 'react';
import { Award, CheckCircle2, Clock, LineChart, TrendingUp } from 'lucide-react';
import { useSession } from '../hooks/useSession';

export default function ProgressTracker() {
  const { session } = useSession();
  const stats = session?.stats || {
    document_count: 0,
    material_count: 0,
    completed_task_count: 0,
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Average Exam Score</span>
            <Award className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-slate-900">—%</p>
          <p className="mt-1 text-xs text-slate-500">Complete an exam simulation to record</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Completed Study Tasks</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-slate-900">
            {stats.completed_task_count}
          </p>
          <p className="mt-1 text-xs text-slate-500">Deterministic planner tracking</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Study Materials Created</span>
            <TrendingUp className="h-4 w-4 text-violet-600" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-slate-900">
            {stats.material_count}
          </p>
          <p className="mt-1 text-xs text-slate-500">Across {stats.document_count} document(s)</p>
        </div>
      </div>

      {/* Score History & Activity */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-indigo-600" />
          <h3 className="font-display text-base font-bold text-slate-900">
            Quiz &amp; Exam Performance Breakdown
          </h3>
        </div>
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-14 text-center">
          <Clock className="h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-800">No graded attempts yet</p>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            Take a practice quiz or exam simulation to see your score progression and activity log
            here.
          </p>
        </div>
      </div>
    </div>
  );
}
