import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import SessionBanner from './components/layout/SessionBanner';
import { SessionProvider } from './context/SessionContext';
import AITutor from './pages/AITutor';
import Dashboard from './pages/Dashboard';
import ExamSimulation from './pages/ExamSimulation';
import Flashcards from './pages/Flashcards';
import LandingPage from './pages/LandingPage';
import PDFAnalyzer from './pages/PDFAnalyzer';
import ProgressTracker from './pages/ProgressTracker';
import QuizGenerator from './pages/QuizGenerator';
import StudyLibrary from './pages/StudyLibrary';
import StudyPlanner from './pages/StudyPlanner';
import Summarizer from './pages/Summarizer';

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <div className=" flex min-h-screen flex-col bg-slate-50 text-slate-900">
          <SessionBanner />
          <Navbar />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/documents" element={<PDFAnalyzer />} />
              <Route path="/summarizer" element={<Summarizer />} />
              <Route path="/quizzes" element={<QuizGenerator />} />
              <Route path="/flashcards" element={<Flashcards />} />
              <Route path="/tutor" element={<AITutor />} />
              <Route path="/exams" element={<ExamSimulation />} />
              <Route path="/planner" element={<StudyPlanner />} />
              <Route path="/progress" element={<ProgressTracker />} />
              <Route path="/library" element={<StudyLibrary />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <footer className="mt-12 border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
            <div className="mx-auto max-w-7xl px-4">
              StudyMate AI • Local Ollama (<code className="font-mono">gemma3:1b</code>) • Private
              Anonymous Browser Sessions
            </div>
          </footer>
        </div>
      </BrowserRouter>
    </SessionProvider>
  );
}
