import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, GraduationCap, Upload } from 'lucide-react';

export default function ExamSimulation() {
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Exam Config */}
      <div className="space-y-6 lg:col-span-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
          <h2 className="font-display text-base font-bold text-slate-900">Exam Parameters</h2>
          <p className="mt-1 text-xs text-slate-500">
            Scores and percentages are calculated deterministically in Python after submission.
          </p>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Source Material</label>
            <div className="mt-1.5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
              <span className="truncate">No document selected</span>
              <Link to="/documents" className="ml-2 font-semibold text-indigo-600 hover:underline">
                Upload →
              </Link>
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Exam Length</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[5, 10, 20].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setQuestionCount(cnt)}
                  className={`rounded-xl border py-2 text-xs font-semibold transition ${
                    questionCount === cnt
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {cnt} Qs
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Difficulty Level</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {['easy', 'medium', 'hard'].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setDifficulty(lvl)}
                  className={`rounded-xl border py-2 text-xs font-semibold capitalize transition ${
                    difficulty === lvl
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GraduationCap className="h-4 w-4" />
            <span>Start Practice Exam</span>
          </button>
        </div>
      </div>

      {/* Right Exam Sheet & Attempt History */}
      <div className="lg:col-span-8">
        <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-2xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <Award className="h-6 w-6" />
          </div>
          <h3 className="mt-4 font-display text-base font-bold text-slate-900">
            Exam Simulation &amp; Attempt Review
          </h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
            Complete all exam questions before submitting. Your attempt is graded by backend Python
            logic and saved to your session progress history.
          </p>
          <Link
            to="/documents"
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5 text-indigo-600" />
            <span>Upload Study Material First</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
