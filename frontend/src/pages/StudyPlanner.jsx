import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
} from 'lucide-react';
import { useSession } from '../hooks/useSession';
import {
  createPlannerTask,
  deletePlannerTask,
  fetchPlannerTasks,
  updatePlannerTask,
} from '../services/api';

export default function StudyPlanner() {
  const { refreshSession } = useSession();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadTasks = useCallback(async () => {
    try {
      const list = await fetchPlannerTasks();
      setTasks(list);
    } catch {
      // Ignore load errors
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createPlannerTask({
        title: title.trim(),
        description: description.trim(),
        due_date: dueDate || null,
      });
      setTitle('');
      setDescription('');
      setDueDate('');
      await loadTasks();
      await refreshSession();
    } catch (err) {
      setError(
        err?.response?.data?.detail || 'Could not create study task.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleCompleted = async (task) => {
    try {
      await updatePlannerTask(task.id, { completed: !task.completed });
      await loadTasks();
      await refreshSession();
    } catch (err) {
      setError(
        err?.response?.data?.detail || 'Could not update task status.'
      );
    }
  };

  const handleDelete = async (taskId) => {
    try {
      await deletePlannerTask(taskId);
      await loadTasks();
      await refreshSession();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not delete task.');
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'upcoming') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Add Task Form */}
      <div className="lg:col-span-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
          <h2 className="font-display text-base font-bold text-slate-900">New Study Task</h2>
          <p className="mt-1 text-xs text-slate-500">
            Organize readings, problem sets, and exam dates in your browser session.
          </p>

          <form onSubmit={handleCreateTask} className="mt-5 space-y-4">
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
              <label className="block text-xs font-semibold text-slate-700">
                Notes / Details (Optional)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Focus on oxidative phosphorylation definitions…"
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

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!title.trim() || submitting}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>{submitting ? 'Saving…' : 'Add Task to Planner'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Task List */}
      <div className="lg:col-span-8">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Your Study Schedule ({filteredTasks.length})
              </h3>
              <p className="text-xs text-slate-500">
                Click the check icon to toggle task completion deterministically.
              </p>
            </div>
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

          {filteredTasks.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-14 text-center">
              <CalendarCheck className="h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-800">
                No study tasks in this view
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Add your upcoming readings, quiz practice goals, and exam dates on the left.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-2.5">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-start justify-between gap-3 rounded-2xl border p-4 transition ${
                    task.completed
                      ? 'border-slate-200/70 bg-slate-50/60 opacity-75'
                      : 'border-slate-200 bg-white hover:border-indigo-200'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleToggleCompleted(task)}
                      className="mt-0.5 text-slate-400 hover:text-indigo-600"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold ${
                          task.completed
                            ? 'line-through text-slate-500'
                            : 'text-slate-900'
                        }`}
                      >
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="mt-1 text-xs text-slate-600">{task.description}</p>
                      )}
                      {task.due_date && (
                        <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          <Calendar className="h-3 w-3" />
                          <span>Due: {task.due_date}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(task.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
