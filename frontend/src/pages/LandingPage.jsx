import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  FileText,
  GraduationCap,
  Layers,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';

function ScrollReveal({
  children,
  variant = 'up',
  delayMs = 0,
  className = '',
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
          } else if (entry.boundingClientRect.top > 80) {
            // Re-animate when scrolling back down again
            setVisible(false);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -36px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const baseClass =
    variant === 'left'
      ? 'scroll-reveal-left'
      : variant === 'right'
      ? 'scroll-reveal-right'
      : variant === 'scale'
      ? 'scroll-reveal-scale'
      : 'scroll-reveal';

  return (
    <div
      ref={ref}
      style={{ '--reveal-delay': `${delayMs}ms` }}
      className={`${baseClass} ${visible ? 'is-visible' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Upload Your Course Material',
    description:
      'Drop in your lecture PDFs or Word (.docx) study guides. Text is safely extracted, split into passages, and indexed for instant search.',
    icon: Upload,
  },
  {
    step: '02',
    title: 'Generate Grounded Study Aids',
    description:
      'Create structured summaries, flashcards, and practice quizzes powered locally by Gemma 3 1B—strictly grounded in your notes.',
    icon: Sparkles,
  },
  {
    step: '03',
    title: 'Test Yourself & Track Progress',
    description:
      'Take full exam simulations with deterministic grading, ask the AI Tutor targeted questions, and manage deadlines in your Study Planner.',
    icon: GraduationCap,
  },
];

const FEATURES = [
  {
    to: '/reviewer',
    icon: Sparkles,
    color: 'bg-blue-50 text-blue-600',
    title: 'AI Study Reviewer Maker',
    description:
      'Upload PDF or PowerPoint slides to automatically generate complete, structured study reviewers with one-click PDF download.',
  },
  {
    to: '/documents',
    icon: FileText,
    color: 'bg-indigo-50 text-indigo-600',
    title: 'PDF & PPTX Analyzer',
    description:
      'Upload lecture slides, textbook chapters, or notes up to 20 MB. Automatically chunked and indexed with SQLite FTS5 full-text search.',
  },
  {
    to: '/summarizer',
    icon: Sparkles,
    color: 'bg-violet-50 text-violet-600',
    title: 'Structured AI Summarizer',
    description:
      'Generate short, medium, or detailed study notes complete with main ideas, key terms, definitions, and source-supported takeaways.',
  },
  {
    to: '/quizzes',
    icon: BrainCircuit,
    color: 'bg-amber-50 text-amber-600',
    title: 'Multiple-Choice Quiz Maker',
    description:
      'Configure question count and difficulty. Answer keys remain hidden until you submit, followed by grounded explanations.',
  },
  {
    to: '/flashcards',
    icon: BookOpen,
    color: 'bg-emerald-50 text-emerald-600',
    title: 'Active Recall Flashcards',
    description:
      'Flip through question-and-answer decks, shuffle cards, and reinforce definitions linked directly to your uploaded documents.',
  },
  {
    to: '/tutor',
    icon: MessageSquare,
    color: 'bg-sky-50 text-sky-600',
    title: 'Document-Grounded AI Tutor',
    description:
      'Ask questions about your readings. Retrieves relevant passages first and clearly distinguishes document facts from general knowledge.',
  },
  {
    to: '/exams',
    icon: GraduationCap,
    color: 'bg-rose-50 text-rose-600',
    title: 'Exam Simulation & Planner',
    description:
      'Simulate real exam conditions with exact Python-calculated scores, and organize your study schedule in the built-in Planner.',
  },
];

export default function LandingPage() {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) {
        setScrollProgress(0);
        return;
      }
      const pct = Math.min(100, Math.max(0, (window.scrollY / docHeight) * 100));
      setScrollProgress(pct);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="space-y-20 pb-16">
      {/* Top Scroll Progress Indicator */}
      <div className="fixed top-0 right-0 left-0 z-50 h-1 bg-transparent pointer-events-none">
        <div
          className="h-full bg-gradient-to-r from-indigo-600 via-violet-600 to-emerald-500 transition-[width] duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-200/80 bg-white pt-12 pb-16 sm:pt-16 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            {/* Left Copy */}
            <ScrollReveal variant="left" className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/80 px-3.5 py-1.5 text-xs font-semibold text-indigo-700">
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
                <span>100% Free • No Signup Required • Private Browser Session</span>
              </div>

              <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-[52px] lg:leading-[1.12]">
                Study smarter from your own{' '}
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  course notes &amp; PDFs.
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Studexa turns your uploaded syllabi, lecture slides, and textbook chapters into
                structured summaries, interactive flashcards, practice quizzes, and realistic exam
                simulations—powered locally by Gemma 3 1B.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700"
                >
                  <span>Start Studying Now</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/documents"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-2xs transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
                >
                  <Upload className="h-4 w-4 text-indigo-600" />
                  <span>Upload a Document</span>
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-6 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Supports PDF, PPTX/PPT &amp; DOCX up to 20 MB
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Source-grounded answers (FTS5 search)
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Isolated anonymous workspace
                </span>
              </div>
            </ScrollReveal>

            {/* Right Interactive Preview Card */}
            <ScrollReveal variant="right" delayMs={140} className="lg:col-span-5">
              <div className="animate-float-slow rounded-3xl border border-slate-200/90 bg-slate-900 p-6 text-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/studexa-logo.png"
                      alt="Studexa"
                      className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-700"
                    />
                    <div>
                      <p className="text-xs font-semibold text-white">Cellular_Biology_Ch4.pdf</p>
                      <p className="text-[11px] text-slate-400">24 chunks indexed • FTS5 Ready</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                    Grounded
                  </span>
                </div>

                <div className="mt-5 space-y-3.5">
                  <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-4">
                    <span className="text-[11px] font-semibold tracking-wider text-indigo-400 uppercase">
                      AI Summary Excerpt
                    </span>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
                      • <strong>ATP Synthase:</strong> Uses the proton motive force across the inner
                      mitochondrial membrane to phosphorylate ADP into ATP (Chunk #7).
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold tracking-wider text-amber-400 uppercase">
                        Practice Quiz Question
                      </span>
                      <span className="text-[11px] text-slate-400">Medium Difficulty</span>
                    </div>
                    <p className="mt-1.5 text-xs font-medium text-white">
                      Which complex in the electron transport chain does NOT pump protons?
                    </p>
                    <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-2.5 py-1.5 text-slate-300">
                        A. Complex I
                      </div>
                      <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1.5 font-semibold text-emerald-300">
                        B. Complex II ✓
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between rounded-xl bg-indigo-600/20 px-4 py-2.5 text-xs text-indigo-200">
                  <span>Ready to try with your own notes?</span>
                  <Link to="/documents" className="font-semibold text-white underline">
                    Upload PDF →
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* 3-Step Student Workflow */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal variant="up" className="text-center">
          <span className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
            How Studexa Works
          </span>
          <h2 className="mt-2 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            From Raw Lecture Notes to Exam Readiness in 3 Steps
          </h2>
        </ScrollReveal>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {WORKFLOW_STEPS.map(({ step, title, description, icon: Icon }, idx) => (
            <ScrollReveal key={step} variant="up" delayMs={idx * 120}>
              <div className="relative h-full rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-2xl font-bold text-slate-200">{step}</span>
                </div>
                <h3 className="mt-4 font-display text-base font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Complete Toolkit Grid */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal
          variant="up"
          className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end"
        >
          <div>
            <span className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
              Complete Study Suite
            </span>
            <h2 className="mt-2 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
              Purpose-Built Tools for Active Learning
            </h2>
          </div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            <span>Explore Workspace</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </ScrollReveal>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ to, icon: Icon, color, title, description }, idx) => (
            <ScrollReveal key={title} variant="up" delayMs={(idx % 3) * 110}>
              <Link
                to={to}
                className="group flex h-full flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-md"
              >
                <div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold text-slate-900 group-hover:text-indigo-600">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
                </div>
                <div className="mt-5 flex items-center gap-1 text-xs font-semibold text-indigo-600">
                  <span>Open Tool</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Anonymous Privacy Callout */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal variant="scale" delayMs={80}>
          <div className="rounded-3xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-violet-50 p-8 shadow-xs sm:p-10">
            <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
                  <Lock className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Private Anonymous Workspace — Zero Accounts or Tracking
                  </h3>
                  <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
                    Your browser automatically receives an anonymous session token when you open the
                    app. Only a cryptographic SHA-256 hash is stored on the server, keeping your
                    uploaded PDFs, flashcards, quizzes, and study history completely isolated from
                    other students.
                  </p>
                </div>
              </div>
              <Link
                to="/dashboard"
                className="shrink-0 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-xs transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Launch Study Dashboard
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
