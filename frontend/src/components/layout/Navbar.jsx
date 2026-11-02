import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Library,
  LineChart,
  Menu,
  MessageSquare,
  Sparkles,
  X,
} from 'lucide-react';
import { useSession } from '../../hooks/useSession';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/summarizer', label: 'Summarizer', icon: Sparkles },
  { to: '/quizzes', label: 'Quizzes', icon: BrainCircuit },
  { to: '/flashcards', label: 'Flashcards', icon: BookOpen },
  { to: '/tutor', label: 'AI Tutor', icon: MessageSquare },
  { to: '/exams', label: 'Exam Sim', icon: GraduationCap },
  { to: '/planner', label: 'Planner', icon: CalendarCheck },
  { to: '/progress', label: 'Progress', icon: LineChart },
  { to: '/library', label: 'Library', icon: Library },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { session, health } = useSession();

  const shortSessionId = session?.session_id
    ? `${session.session_id.slice(0, 8)}…`
    : 'Connecting…';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-slate-900">
              StudyMate <span className="text-indigo-600">AI</span>
            </span>
            <span className="ml-2 hidden rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 sm:inline-block">
              Free &amp; No Login
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden xl:flex xl:items-center xl:gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Session & Health Pill */}
        <div className="hidden items-center gap-2 md:flex">
          <div
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
            title="Your anonymous browser session ID"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                health?.status === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span className="font-medium text-slate-700">Session:</span>
            <code className="font-mono text-slate-900">{shortSessionId}</code>
          </div>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 xl:hidden"
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 pt-2 pb-4 xl:hidden">
          <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span>
              Anonymous Session: <code className="font-mono font-semibold">{shortSessionId}</code>
            </span>
            <span className="font-medium text-emerald-700">
              {health?.status === 'ok' ? 'API Online' : 'Connecting'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
