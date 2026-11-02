import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  CheckCircle2,
  FileText,
  GraduationCap,
  Library,
  LineChart,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import JobQueuePanel from '../components/jobs/JobQueuePanel';
import { useSession } from '../hooks/useSession';

const QUICK_TOOLS = [
  {
    to: '/documents',
    title: 'PDF & DOCX Analyzer',
    description: 'Upload lecture notes or chapters to extract and index text.',
    icon: FileText,
    accent: 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white',
    actionLabel: 'Manage Documents',
  },
  {
    to: '/summarizer',
    title: 'AI Summarizer',
    description: 'Create short, medium, or detailed summaries with key definitions.',
    icon: Sparkles,
    accent: 'bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white',
    actionLabel: 'Generate Summary',
  },
  {
    to: '/quizzes',
    title: 'AI Quiz Generator',
    description: 'Practice multiple-choice questions with grounded explanations.',
    icon: BrainCircuit,
    accent: 'bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white',
    actionLabel: 'Create Quiz',
  },
  {
    to: '/flashcards',
    title: 'Flashcard Decks',
    description: 'Review key concepts with interactive flip cards and shuffle mode.',
    icon: BookOpen,
    accent: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white',
    actionLabel: 'Study Flashcards',
  },
  {
    to: '/tutor',
    title: 'AI Study Tutor',
    description: 'Ask targeted questions answered directly from your course files.',
    icon: MessageSquare,
    accent: 'bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white',
    actionLabel: 'Ask Tutor',
  },
  {
    to: '/exams',
    title: 'Exam Simulation',
    description: 'Take full practice exams with deterministic Python grading.',
    icon: GraduationCap,
    accent: 'bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white',
    actionLabel: 'Start Exam Sim',
  },
];

export default function Dashboard() {
  const { session, health, activeDocument, loading, refreshSession } = useSession();

  const stats = session?.stats || {
    document_count: 0,
    material_count: 0,
    pending_job_count: 0,
    completed_task_count: 0,
  };

  return (
    <div className="space-y-8">
      {/* Welcome Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-violet-900 p-6 text-white shadow-lg sm:p-8">
        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-indigo-100 backdrop-blur-xs">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              {activeDocument
                ? `Active Source: ${activeDocument.original_filename}`
                : 'Ready for your study session'}
            </span>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              What are we studying today?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-indigo-100/90">
              Start by uploading a PDF or Word document. Once indexed in SQLite FTS5, you can
              generate summaries, practice quizzes, flashcards, or chat with the AI Study Tutor.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              to="/documents"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-950 shadow-sm transition hover:bg-indigo-50"
            >
              <Upload className="h-4 w-4 text-indigo-600" />
              <span>Upload Document</span>
            </Link>
            <Link
              to="/planner"
              className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-sm font-semibold text-white backdrop-blur-xs transition hover:bg-white/20"
            >
              <CalendarCheck className="h-4 w-4" />
              <span>Study Planner</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Key Workspace Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link
          to="/documents"
          className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs transition hover:border-indigo-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Course Documents</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-slate-900">
            {stats.document_count}
          </p>
          <p className="mt-1 text-xs text-slate-500 group-hover:text-indigo-600">
            PDF &amp; DOCX files in session →
          </p>
        </Link>

        <Link
          to="/library"
          className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs transition hover:border-indigo-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Study Materials</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <Library className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-slate-900">
            {stats.material_count}
          </p>
          <p className="mt-1 text-xs text-slate-500 group-hover:text-indigo-600">
            Summaries, quizzes &amp; decks →
          </p>
        </Link>

        <Link
          to="/planner"
          className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs transition hover:border-indigo-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Completed Tasks</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-slate-900">
            {stats.completed_task_count}
          </p>
          <p className="mt-1 text-xs text-slate-500 group-hover:text-indigo-600">
            View study planner →
          </p>
        </Link>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Active AI Jobs</span>
            <button
              type="button"
              onClick={refreshSession}
              disabled={loading}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Refresh workspace counts"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-indigo-600">
            {stats.pending_job_count}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Server queue: {health ? `${health.ai_queue_depth}/${health.ai_max_queue}` : 'Ready'}
          </p>
        </div>
      </div>

      {/* Main Study Tools Grid */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">AI Study Tools</h3>
            <p className="text-xs text-slate-500">
              Choose a tool to generate study aids or test your understanding.
            </p>
          </div>
          <Link
            to="/library"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            View All Saved Materials →
          </Link>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_TOOLS.map(({ to, title, description, icon: Icon, accent, actionLabel }) => (
            <Link
              key={to}
              to={to}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
            >
              <div>
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${accent}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h4 className="mt-4 font-display text-base font-bold text-slate-900 group-hover:text-indigo-600">
                  {title}
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{description}</p>
              </div>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-indigo-600">
                <span>{actionLabel}</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Live AI Request Queue Panel */}
      <JobQueuePanel />

      {/* Productivity & Progress Shortcuts */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-emerald-600" />
          <h3 className="font-display text-base font-bold text-slate-900">
            Organization &amp; Progress
          </h3>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            to="/planner"
            className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 transition hover:border-indigo-200 hover:bg-indigo-50/40"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-2xs">
                <CalendarCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">Study Planner</p>
                <p className="text-[11px] text-slate-500">Manage reading tasks &amp; deadlines</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400" />
          </Link>

          <Link
            to="/progress"
            className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 transition hover:border-indigo-200 hover:bg-indigo-50/40"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-2xs">
                <LineChart className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">Learning Progress</p>
                <p className="text-[11px] text-slate-500">Quiz &amp; exam score analytics</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400" />
          </Link>

          <Link
            to="/library"
            className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 transition hover:border-indigo-200 hover:bg-indigo-50/40"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-violet-600 shadow-2xs">
                <Library className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">Personal Study Library</p>
                <p className="text-[11px] text-slate-500">All files, study sets &amp; PDF exports</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}
