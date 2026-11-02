import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  RotateCcw,
  Shuffle,
  Sparkles,
} from 'lucide-react';

const SAMPLE_DECK = [
  {
    question: 'How doStudyMate AI flashcards stay grounded in your material?',
    answer:
      'Every card is generated strictly from your uploaded PDF or DOCX chunks and linked to your anonymous browser session.',
  },
  {
    question: 'What happens when you flip or shuffle a flashcard deck?',
    answer:
      'You can reveal the answer on click, navigate Previous/Next, shuffle card order for active recall, or restart the deck at any time.',
  },
];

export default function Flashcards() {
  const [cards, setCards] = useState(SAMPLE_DECK);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const currentCard = cards[currentIndex];

  const handleNext = () => {
    setFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % cards.length);
  };

  const handlePrev = () => {
    setFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
  };

  const handleShuffle = () => {
    setFlipped(false);
    setCards((prev) => [...prev].sort(() => Math.random() - 0.5));
    setCurrentIndex(0);
  };

  const handleRestart = () => {
    setFlipped(false);
    setCurrentIndex(0);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Deck Controls */}
      <div className="space-y-6 lg:col-span-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
          <h2 className="font-display text-base font-bold text-slate-900">Flashcard Deck Setup</h2>
          <p className="mt-1 text-xs text-slate-500">
            Generate Q&amp;A review decks from your uploaded study documents.
          </p>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Source Document</label>
            <div className="mt-1.5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
              <span className="truncate">Preview Demo Deck</span>
              <Link to="/documents" className="ml-2 font-semibold text-indigo-600 hover:underline">
                Upload PDF →
              </Link>
            </div>
          </div>

          <button
            type="button"
            disabled
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            <span>Upload Document to Generate Deck</span>
          </button>
        </div>
      </div>

      {/* Right Interactive Flip Card Viewer */}
      <div className="lg:col-span-8">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs sm:p-8">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-slate-700">
              Card {currentIndex + 1} of {cards.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleShuffle}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-50"
              >
                <Shuffle className="h-3.5 w-3.5" />
                <span>Shuffle</span>
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Restart</span>
              </button>
            </div>
          </div>

          {/* Interactive Card */}
          <div
            onClick={() => setFlipped(!flipped)}
            className={`mt-4 flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-2xl border p-8 text-center transition-all select-none ${
              flipped
                ? 'border-emerald-200 bg-emerald-50/50'
                : 'border-indigo-100 bg-gradient-to-br from-slate-50 to-indigo-50/40 hover:border-indigo-300'
            }`}
          >
            <span
              className={`rounded-full px-3 py-0.5 text-[11px] font-bold uppercase ${
                flipped ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-700'
              }`}
            >
              {flipped ? 'Answer' : 'Question'}
            </span>
            <p className="mt-4 max-w-xl font-display text-lg font-bold text-slate-900 sm:text-xl">
              {flipped ? currentCard.answer : currentCard.question}
            </p>
            <span className="mt-6 text-xs font-medium text-slate-400">
              Click card to {flipped ? 'show question' : 'reveal answer'}
            </span>
          </div>

          {/* Navigation Controls */}
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrev}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              onClick={() => setFlipped(!flipped)}
              className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {flipped ? 'Show Question' : 'Flip Card'}
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <span>Next</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
