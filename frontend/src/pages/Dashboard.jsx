import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  CheckCircle2,
  Cpu,
  FileText,
  GraduationCap,
  Library,
  LineChart,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useSession } from '../hooks/useSession';

const STUDY_TOOLS = [
  {
    to: '/documents',
    title: 'PDF / Document Analyzer',
    description: 'Upload PDF & DOCX files, extract text, and index chunks for AI tools.',
    icon: FileText,
    badge: 'Phase 2',
  },
  {
    to: '/summarizer',
    title: 'AI Summarizer',
    description: 'Generate structured short, medium, or detailed summaries from your notes.',
    icon: Sparkles,
    badge: 'Phase 4',
  },
  {
    to: '/quizzes',
    title: 'AI Quiz Generator',
    description: 'Create multiple-choice practice questions with grounded explanations.',
    icon: BrainCircuit,
    badge: 'Phase 4',
  },
  {
    to: '/flashcards',
    title: 'Flashcard Generator',
    description: 'Interactive Q&A flip cards with shuffle and source links.',
    icon: BookOpen,
    badge: 'Phase 4',
  },
  {
    to: '/tutor',
    title: 'AI Study Tutor',
    description: 'Ask questions answered from your uploaded material via FTS5 retrieval.',
    icon: MessageSquare,
    badge: 'Phase 4',
  },
  {
    to: '/exams',
    title: 'Exam Simulation',
    description: 'Take practice exams with deterministic Python scoring and feedback.',
    icon: GraduationCap,
    badge: 'Phase 4',
  },
  {
    to: '/planner',
    title: 'Study Planner',
    description: 'Track study tasks and upcoming deadlines in your browser session.',
    icon: CalendarCheck,
    badge: 'Phase 5',
  },
  {
    to: '/progress',
    title: 'Learning Progress',
    description: 'Review quiz/exam score trends and completed tasks.',
    icon: LineChart,
    badge: 'Phase 5',
  },
  {
    to: '/library',
    title: 'Personal Study Library',
    description: 'Browse, open, export, or delete your uploaded documents and materials.',
    icon: Library,
    badge: 'Phase 5',
  },
];

export default function Dashboard() {
  const { session, health, loading, error, refreshSession, retryConnection } = useSession();

  const stats = session?.stats || {
    document_count: 0,
    material_count: 0,
    pending_job_count: 0,
    completed_task_count: 0,
  };

  return (
    <div className="space-y-8 py-6">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Anonymous Session Active
          </span>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Student Study Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            Welcome! Your workspace is isolated to this browser without needing an account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshSession}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Status</span>
          </button>
          <Link
            to="/documents"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Upload Document</span>
          </Link>
        </div>
      </div>

      {/* Error State if backend is unreachable */}
      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={retryConnection}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Session Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <p className="text-xs font-medium text-slate-500 uppercase">Uploaded Documents</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{stats.document_count}</p>
          <p className="mt-1 text-xs text-slate-500">Scoped to your session</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <p className="text-xs font-medium text-slate-500 uppercase">Generated Materials</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{stats.material_count}</p>
          <p className="mt-1 text-xs text-slate-500">Summaries, quizzes &amp; cards</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <p className="text-xs font-medium text-slate-500 uppercase">Completed Study Tasks</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{stats.completed_task_count}</p>
          <p className="mt-1 text-xs text-slate-500">From your Study Planner</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <p className="text-xs font-medium text-slate-500 uppercase">AI Queue Status</p>
          <p className="mt-2 text-3xl font-bold text-indigo-600">
            {health ? `${health.ai_queue_depth} / ${health.ai_max_queue}` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Model: <code className="font-mono">{health?.ai_model || 'gemma3:1b'}</code> (1 worker)
          </p>
        </div>
      </div>

      {/* Study Tools Grid */}
      <div>
        <h2 className="text-lg font-bold text-slate-900">Available Study Modules</h2>
        <p className="text-sm text-slate-600">
          Select a tool below to analyze materials or practice for upcoming exams.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STUDY_TOOLS.map(({ to, title, description, icon: Icon, badge }) => (
            <Link
              key={to}
              to={to}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {badge}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900 group-hover:text-indigo-600">
                  {title}
                </h3>
                <p className="mt-1 text-sm text-slate-600">{description}</p>
              </div>
              <div className="mt-4 text-xs font-semibold text-indigo-600">Open Module →</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Session & Backend Connection Diagnostics */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Cpu className="h-4 w-4 text-indigo-600" />
          <h3>Session &amp; System Status (Phase 1 Verified)</h3>
        </div>
        <div className="mt-4 grid gap-4 text-xs text-slate-600 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3.5">
            <span className="font-semibold text-slate-800">Anonymous Session ID:</span>
            <p className="mt-1 break-all font-mono text-slate-700">
              {session?.session_id || 'Initializing…'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3.5">
            <span className="font-semibold text-slate-800">Session Expires At:</span>
            <p className="mt-1 font-mono text-slate-700">
              {session?.expires_at ? new Date(session.expires_at).toLocaleString() : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3.5">
            <span className="font-semibold text-slate-800">Backend &amp; Database Health:</span>
            <p className="mt-1 flex items-center gap-1.5 font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {health
                  ? `${health.status.toUpperCase()} (${health.database}, max_concurrent=${health.ai_max_concurrent})`
                  : 'Checking…'}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
