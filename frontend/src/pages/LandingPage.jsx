import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  FileText,
  GraduationCap,
  Lock,
  MessageSquare,
  Sparkles,
  Zap,
} from 'lucide-react';

const FEATURES = [
  {
    icon: FileText,
    title: 'PDF & DOCX Analyzer',
    description:
      'Upload lecture slides, textbook chapters, or DOCX notes. Automatically chunked and indexed with SQLite FTS5 search.',
  },
  {
    icon: Sparkles,
    title: 'Source-Grounded Summarizer',
    description:
      'Generate concise, medium, or detailed summaries with key terms and definitions strictly grounded in your uploaded material.',
  },
  {
    icon: BrainCircuit,
    title: 'AI Quiz Generator',
    description:
      'Practice with custom multiple-choice quizzes at your chosen difficulty, with instant deterministic grading and explanations.',
  },
  {
    icon: BookOpen,
    title: 'Interactive Flashcards',
    description:
      'Review key concepts with flip cards, shuffle mode, and progress tracking linked directly to your study documents.',
  },
  {
    icon: MessageSquare,
    title: 'AI Study Tutor',
    description:
      'Ask questions about your documents. Retrieves relevant passages first and clearly distinguishes source facts from general knowledge.',
  },
  {
    icon: GraduationCap,
    title: 'Exam Simulation & Planner',
    description:
      'Take full timed or untimed practice exams graded deterministically in Python, and organize deadlines in your Study Planner.',
  },
];

export default function LandingPage() {
  return (
    <div className="space-y-16 py-8 sm:py-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 px-6 py-14 text-white shadow-xl sm:px-12 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3.5 py-1.5 text-xs font-medium text-indigo-200">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span>Powered by Local Gemma 3 1B • 100% Free • Zero Account Required</span>
          </div>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-5xl">
            Turn Your Course Documents Into Active Study Sessions
          </h1>
          <p className="mt-5 text-base leading-relaxed text-indigo-100/90 sm:text-lg">
            Upload your PDFs or Word documents to generate structured summaries, flashcards,
            practice quizzes, and full exam simulations—isolated safely in your anonymous browser
            workspace.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-indigo-950 shadow-md transition hover:bg-indigo-50"
            >
              <span>Start Studying Now</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/documents"
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-300/40 bg-indigo-900/40 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-800/50"
            >
              <FileText className="h-4 w-4" />
              <span>Upload Study Material</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Everything You Need to Prepare for Exams
          </h2>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            Designed for students with a clean, distraction-free academic workspace.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition hover:border-indigo-200 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">{title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy & Session Callout */}
      <section className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Private Anonymous Sessions by Design
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Each visitor receives a cryptographically random session token stored in your
                browser. The server stores only its SHA-256 hash and isolates your files, study
                materials, and AI jobs from every other visitor.
              </p>
            </div>
          </div>
          <Link
            to="/dashboard"
            className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Open Dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
