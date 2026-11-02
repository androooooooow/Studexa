import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  LineChart,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import {
  fetchProgressActivity,
  fetchProgressOverview,
} from '../services/api';

const ACTIVITY_LABELS = {
  document_uploaded: 'Uploaded study document',
  summary_generated: 'Generated AI study summary',
  quiz_generated: 'Generated multiple-choice quiz',
  quiz_submitted: 'Completed & graded practice quiz',
  flashcards_generated: 'Generated flashcard deck',
  tutor_question_answered: 'Asked AI Study Tutor a question',
  exam_generated: 'Generated practice exam simulation',
  exam_submitted: 'Submitted exam simulation for grading',
  planner_task_created: 'Added task to Study Planner',
  planner_task_completed: 'Completed Study Planner task',
};

export default function ProgressTracker() {
  const [overview, setOverview] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, act] = await Promise.all([
        fetchProgressOverview(),
        fetchProgressActivity(),
      ]);
      setOverview(ov);
      setActivities(act);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const totalMaterials = overview
    ? Object.values(overview.material_counts_by_type || {}).reduce(
        (acc, v) => acc + v,
        0
      )
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Refresh Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            Deterministic Study Analytics
          </h2>
          <p className="text-xs text-slate-500">
            All metrics and percentages are calculated deterministically by the Python backend.
          </p>
        </div>
        <button
          type="button"
          onClick={loadProgress}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Stats</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Average Score</span>
            <Award className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-slate-900">
            {overview && overview.exam_attempt_count > 0
              ? `${overview.average_exam_percentage}%`
              : '—%'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across {overview?.exam_attempt_count || 0} graded attempt(s)
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Highest Score</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-emerald-700">
            {overview && overview.exam_attempt_count > 0
              ? `${overview.highest_exam_percentage}%`
              : '—%'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Personal best in this session</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Planner Tasks</span>
            <CheckCircle2 className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-slate-900">
            {overview
              ? `${overview.completed_tasks} / ${overview.total_tasks}`
              : '0 / 0'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {overview?.pending_tasks || 0} task(s) remaining
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Study Materials</span>
            <LineChart className="h-4 w-4 text-violet-600" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-slate-900">
            {totalMaterials}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across {overview?.document_count || 0} uploaded document(s)
          </p>
        </div>
      </div>

      {/* Split: Score Bars & Activity Timeline */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Score History */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs lg:col-span-7">
          <h3 className="font-display text-base font-bold text-slate-900">
            Quiz &amp; Exam Performance History
          </h3>
          {!overview || overview.recent_scores?.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
              <Award className="h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-800">
                No graded attempts yet
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Submit a quiz or exam simulation to track your score progression here.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {overview.recent_scores.map((sc) => (
                <div
                  key={sc.attempt_id}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{sc.title}</span>
                    <span className="font-bold text-indigo-700">
                      {sc.score}/{sc.total_questions} ({sc.percentage}%)
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all"
                      style={{ width: `${Math.min(100, sc.percentage)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {new Date(sc.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity Log */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs lg:col-span-5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-indigo-600" />
            <h3 className="font-display text-base font-bold text-slate-900">
              Recent Activity Timeline
            </h3>
          </div>
          {activities.length === 0 ? (
            <p className="mt-6 text-center text-xs text-slate-500">
              No study actions recorded in this session yet.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {activities.slice(0, 12).map((act) => (
                <div
                  key={act.id}
                  className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5 last:border-none"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      {ACTIVITY_LABELS[act.activity_type] || act.activity_type}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(act.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
