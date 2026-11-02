import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/Navbar';
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
import AIReviewerMaker from './pages/AIReviewerMaker';

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/documents" element={<PDFAnalyzer />} />
            <Route path="/reviewer" element={<AIReviewerMaker />} />
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
        </AppLayout>
      </BrowserRouter>
    </SessionProvider>
  );
}
