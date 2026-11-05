import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  CheckCircle2,
  Cpu,
  FileText,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  Library,
  LineChart,
  Menu,
  MessageSquare,
  Plus,
  Presentation,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useSession } from '../../hooks/useSession';

const NAV_SECTIONS = [
  {
    heading: 'Overview',
    items: [
      { to: '/dashboard', label: 'Study Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    heading: 'Course Materials',
    items: [
      { to: '/documents', label: 'PDF & Doc Analyzer', icon: FileText },
      { to: '/library', label: 'Study Library', icon: Library },
    ],
  },
  {
    heading: 'AI Study Tools',
    items: [
      { to: '/reviewer', label: 'AI Reviewer Maker', icon: Presentation },
      { to: '/summarizer', label: 'AI Summarizer', icon: Sparkles },
      { to: '/quizzes', label: 'Quiz Generator', icon: BrainCircuit },
      { to: '/flashcards', label: 'Flashcards', icon: BookOpen },
      { to: '/tutor', label: 'AI Study Tutor', icon: MessageSquare },
      { to: '/exams', label: 'Exam Simulation', icon: GraduationCap },
    ],
  },
  {
    heading: 'Productivity',
    items: [
      { to: '/planner', label: 'Study Planner', icon: CalendarCheck },
      { to: '/progress', label: 'Progress Tracker', icon: LineChart },
    ],
  },
];

const PAGE_TITLES = {
  '/dashboard': {
    title: 'Study Dashboard',
    subtitle: 'Your anonymous academic workspace & study tools',
  },
  '/documents': {
    title: 'PDF & Document Analyzer',
    subtitle: 'Upload PDF, PPTX/PPT, or DOCX course materials for full-text search & AI study tools',
  },
  '/reviewer': {
    title: 'AI Study Reviewer Maker',
    subtitle: 'Convert lecture slides and handouts into organized, printable study guides with one-click PDF export',
  },
  '/summarizer': {
    title: 'AI Summarizer',
    subtitle: 'Generate structured, source-grounded notes and key term definitions',
  },
  '/quizzes': {
    title: 'AI Quiz Generator',
    subtitle: 'Practice multiple-choice questions with instant grading and explanations',
  },
  '/flashcards': {
    title: 'Interactive Flashcards',
    subtitle: 'Active recall cards generated directly from your course notes',
  },
  '/tutor': {
    title: 'AI Study Tutor',
    subtitle: 'Ask any academic question — with or without your uploaded documents',
  },
  '/exams': {
    title: 'Exam Simulation',
    subtitle: 'Full practice exams with deterministic Python grading and score breakdowns',
  },
  '/planner': {
    title: 'Study Planner',
    subtitle: 'Organize readings, assignments, and exam preparation deadlines',
  },
  '/progress': {
    title: 'Learning Progress Tracker',
    subtitle: 'Track quiz & exam performance, completed tasks, and study milestones',
  },
  '/library': {
    title: 'Personal Study Library',
    subtitle: 'Manage your uploaded files, saved study sets, and PDF exports',
  },
};

export default function AppLayout({ children }) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const { session, health, loading, error, retryConnection } = useSession();

  const isLandingPage = location.pathname === '/';
  const shortSessionId = session?.session_id
    ? `${session.session_id.slice(0, 8)}`
    : 'initializing';

  if (isLandingPage) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
            <Link to="/" className="flex items-center gap-3">
              <img
                src="/studexa-logo.png"
                alt="Studexa Logo"
                className="h-10 w-10 rounded-xl object-cover shadow-sm ring-1 ring-slate-200/80"
              />
              <div>
                <span className="font-display text-lg font-extrabold tracking-tight text-slate-900">
                  Stud<span className="text-indigo-600">exa</span>
                </span>
                <span className="ml-2.5 hidden rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 sm:inline-block">
                  Free • No Account Needed
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-3">
              <Link
                to="/documents"
                className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:inline-flex"
              >
                <FileText className="h-4 w-4 text-indigo-600" />
                <span>Upload Notes</span>
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700"
              >
                <span>Open Study Workspace</span>
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 bg-white py-8 text-xs text-slate-500">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
            <div className="flex items-center gap-2.5">
              <img
                src="/studexa-logo.png"
                alt="Studexa Logo"
                className="h-7 w-7 rounded-lg object-cover ring-1 ring-slate-200"
              />
              <span className="font-display font-bold text-slate-800">Studexa</span>
              <span>— Public Anonymous AI Study Assistant</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-slate-500">
              <span>Local Ollama (<code className="font-mono text-slate-700">gemma3:1b</code>)</span>
              <span>•</span>
              <span>Zero Login Required</span>
              <span>•</span>
              <span>Session-Isolated Storage</span>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  const pageMeta = PAGE_TITLES[location.pathname] || PAGE_TITLES['/dashboard'];

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white">
      <div>
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src="/studexa-logo.png"
              alt="Studexa Logo"
              className="h-10 w-10 rounded-xl object-cover shadow-sm ring-1 ring-slate-200/80"
            />
            <div>
              <span className="font-display text-base font-extrabold tracking-tight text-slate-900">
                Stud<span className="text-indigo-600">exa</span>
              </span>
              <p className="text-[11px] font-medium text-slate-400">Student Workspace</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Primary Quick Upload Button */}
        <div className="px-4 pt-4 pb-2">
          <Link
            to="/documents"
            onClick={() => setMobileMenuOpen(false)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            <span>Upload Study Material</span>
          </Link>
        </div>

        {/* Navigation Groups */}
        <nav className="space-y-5 px-3 py-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.heading}>
              <p className="px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                {section.heading}
              </p>
              <div className="mt-1.5 space-y-0.5">
                {section.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-indigo-50/90 text-indigo-700 font-semibold shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            isActive ? 'text-indigo-600' : 'text-slate-400'
                          }`}
                        />
                        <span className="truncate">{label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Anonymous Session Card */}
      <div className="border-t border-slate-100 p-4">
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  health?.status === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="text-xs font-semibold text-slate-800">Anonymous Session</span>
            </div>
            <button
              type="button"
              onClick={() => setSessionModalOpen(true)}
              className="text-slate-400 hover:text-indigo-600"
              title="How anonymous sessions work"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            Workspace ID: <code className="font-mono font-medium text-slate-700">{shortSessionId}</code>
          </p>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            Saved in this browser. Clearing site data resets your files.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200/80 lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72 max-w-full overflow-y-auto bg-white shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate font-display text-lg font-bold text-slate-900 sm:text-xl">
                  {pageMeta.title}
                </h1>
                <p className="hidden truncate text-xs text-slate-500 sm:block">
                  {pageMeta.subtitle}
                </p>
              </div>
            </div>

            {/* Right Status Indicators */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div
                className="hidden items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50 px-3 py-1.5 text-xs sm:flex"
                title="Serialized Local Ollama AI Queue (1 job at a time)"
              >
                <Cpu className="h-3.5 w-3.5 text-indigo-600" />
                <span className="font-medium text-slate-600">Gemma 3 1B:</span>
                <span className="font-semibold text-slate-900">
                  {health
                    ? `${health.ai_queue_depth}/${health.ai_max_queue} queued`
                    : 'Local Queue'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSessionModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100/80"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span className="hidden md:inline">Private Session</span>
                <code className="font-mono text-[11px]">{shortSessionId}</code>
              </button>
            </div>
          </div>
        </header>

        {/* Non-blocking connection notice if backend is not yet started */}
        {error && (
          <div className="border-b border-amber-200 bg-amber-50/90 px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  <strong>Backend Connection Notice:</strong> {error}
                </span>
              </div>
              <button
                type="button"
                onClick={retryConnection}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-800 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                <span>Reconnect</span>
              </button>
            </div>
          </div>
        )}

        {/* Workspace Page Body */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {/* Anonymous Session Info Modal */}
      {sessionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Anonymous Browser Session
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSessionModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-600">
              <p>
                Studexa does <strong>not</strong> require an account or login. When you visit,
                your browser is assigned a cryptographically random 256-bit session token.
              </p>
              <div className="rounded-xl bg-slate-50 p-3 font-mono text-[11px] text-slate-700">
                <div>
                  <span className="font-sans font-semibold text-slate-500">Session ID: </span>
                  {session?.session_id || 'Not connected'}
                </div>
                <div className="mt-1">
                  <span className="font-sans font-semibold text-slate-500">Expires: </span>
                  {session?.expires_at
                    ? new Date(session.expires_at).toLocaleDateString()
                    : '30 days from last activity'}
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <strong>Important limitation:</strong> Because there are no accounts, your uploaded
                documents, flashcards, quizzes, and planner tasks are tied to this browser’s
                storage. Clearing browser data or using a different device will create a new
                workspace.
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSessionModalOpen(false)}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
