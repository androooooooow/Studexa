import React, { useState } from 'react';
import { Calendar, CalendarCheck, CheckCircle2, Circle, Plus } from 'lucide-react';

export default function StudyPlanner() {
  const [filter, setFilter] = useState('all');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Add Task Form */}
      <div className="lg:col-span-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
          <h2 className="font-display text-base font-bold text-slate-900">New Study Task</h2>
          <p className="mt-1 text-xs text-slate-500">
            Organize readings, problem sets, and exam dates in your browser session.
          </p>

          <form onSubmit={(e) => e.preventDefault()} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Task Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Review Chapter 4 Flashcards"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Target Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={!title.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>Add Task to Planner</span>
            </button>
          </form>
        </div>
      </div>

      {/* Task List */}
      <div className="lg:col-span-8">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-base font-bold text-slate-900">Your Study Schedule</h3>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
              {['all', 'upcoming', 'completed'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`rounded-lg px-3 py-1 font-semibold capitalize transition ${
                    filter === tab ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-14 text-center">
            <CalendarCheck className="h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-800">No study tasks scheduled</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Add your upcoming readings, quiz practice goals, and exam dates to track them across
              your session.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
