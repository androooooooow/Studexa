import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrainCircuit, CheckCircle2, Upload } from 'lucide-react';

export default function QuizGenerator() {
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Quiz Builder Controls */}
      <div className="space-y-6 lg:col-span-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
          <h2 className="font-display text-base font-bold text-slate-900">Quiz Configuration</h2>
          <p className="mt-1 text-xs text-slate-500">
            Generate multiple-choice questions with hidden answer keys until submission.
          </p>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Source Document</label>
            <div className="mt-1.5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
              <span className="truncate">No document selected</span>
              <Link to="/documents" className="ml-2 font-semibold text-indigo-600 hover:underline">
                Upload →
              </Link>
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">
              Number of Questions
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[5, 10, 15].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setQuestionCount(count)}
                  className={`rounded-xl border py-2 text-xs font-semibold transition ${
                    questionCount === count
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {count} Qs
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Difficulty</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {['easy', 'medium', 'hard'].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setDifficulty(level)}
                  className={`rounded-xl border py-2 text-xs font-semibold capitalize transition ${
                    difficulty === level
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BrainCircuit className="h-4 w-4" />
            <span>Generate {questionCount}-Question Quiz</span>
          </button>
        </div>
      </div>

      {/* Quiz Workspace Area */}
      <div className="lg:col-span-8">
        <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-2xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <h3 className="mt-4 font-display text-base font-bold text-slate-900">
            Interactive Multiple-Choice Quiz Area
          </h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
            Answer choices are presented one question at a time or as a complete sheet. Upon
            submission, deterministic backend grading reveals your score and source-grounded
            explanations.
          </p>
          <Link
            to="/documents"
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5 text-indigo-600" />
            <span>Upload a Document to Begin</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
