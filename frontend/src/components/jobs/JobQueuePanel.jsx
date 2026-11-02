import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { cancelAIJob, fetchAIJobs } from '../../services/api';
import { useSession } from '../../hooks/useSession';

const STATUS_BADGE = {
  queued: {
    label: 'Queued',
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock,
  },
  processing: {
    label: 'Processing (Gemma 3 1B)',
    classes: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: Loader2,
  },
  completed: {
    label: 'Completed',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    classes: 'bg-red-50 text-red-700 border-red-200',
    icon: AlertCircle,
  },
};

export default function JobQueuePanel({ refreshTrigger = 0 }) {
  const { refreshSession } = useSession();
  const [jobsData, setJobsData] = useState({
    jobs: [],
    global_queue_depth: 0,
    max_queue_size: 10,
  });
  const [loading, setLoading] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAIJobs();
      setJobsData(data);
    } catch {
      // Ignore transient polling errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs, refreshTrigger]);

  // Poll every 2.5s while any job in the session is queued or processing
  useEffect(() => {
    const hasActive = jobsData.jobs.some(
      (j) => j.status === 'queued' || j.status === 'processing'
    );
    if (!hasActive) return undefined;

    const timer = setInterval(() => {
      loadJobs();
      refreshSession();
    }, 2500);

    return () => clearInterval(timer);
  }, [jobsData.jobs, loadJobs, refreshSession]);

  const handleCancelJob = async (jobId) => {
    setActionError(null);
    try {
      await cancelAIJob(jobId);
      await loadJobs();
      await refreshSession();
    } catch (err) {
      setActionError(
        err?.response?.data?.detail || 'Could not cancel this job.'
      );
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              AI Request Queue &amp; Job History
            </h3>
            <p className="text-xs text-slate-500">
              Serialized FIFO queue (1 active generation globally •{' '}
              {jobsData.global_queue_depth}/{jobsData.max_queue_size} slots in use)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadJobs}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {actionError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
          {actionError}
        </div>
      )}

      {jobsData.jobs.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center text-xs text-slate-500">
          No AI jobs queued in this session yet. Select an uploaded document and trigger an AI
          analysis or study tool to see live queue progress.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {jobsData.jobs.map((job) => {
            const meta = STATUS_BADGE[job.status] || STATUS_BADGE.queued;
            const StatusIcon = meta.icon;
            const isExpanded = expandedJobId === job.id;

            return (
              <div
                key={job.id}
                className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 transition hover:border-slate-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.classes}`}
                    >
                      <StatusIcon
                        className={`h-3.5 w-3.5 ${
                          job.status === 'processing' ? 'animate-spin' : ''
                        }`}
                      />
                      <span>{meta.label}</span>
                      {job.status === 'queued' && job.queue_position && (
                        <span>(Position #{job.queue_position})</span>
                      )}
                    </span>
                    <span className="text-xs font-bold capitalize text-slate-800">
                      {job.job_type.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(job.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {job.status === 'completed' && job.result && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedJobId(isExpanded ? null : job.id)
                        }
                        className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-indigo-600 shadow-2xs ring-1 ring-slate-200 hover:bg-indigo-50"
                      >
                        {isExpanded ? 'Hide Output' : 'View Output'}
                      </button>
                    )}

                    {job.status === 'queued' && (
                      <button
                        type="button"
                        onClick={() => handleCancelJob(job.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Cancel</span>
                      </button>
                    )}
                  </div>
                </div>

                {job.payload?.prompt && (
                  <p className="mt-2 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Prompt: </span>
                    {job.payload.prompt}
                  </p>
                )}

                {job.status === 'failed' && job.error_message && (
                  <div className="mt-2.5 rounded-lg border border-red-200 bg-red-50/80 p-2.5 text-xs text-red-800">
                    <strong>Error:</strong> {job.error_message}
                  </div>
                )}

                {isExpanded && job.result && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-700">
                    {job.result.source_chunks_used?.length > 0 && (
                      <p className="mb-2 text-[11px] font-semibold text-indigo-600">
                        Grounded in Document Chunks:{' '}
                        {job.result.source_chunks_used.map((n) => `#${n}`).join(', ')}
                      </p>
                    )}
                    <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800">
                      {typeof job.result.content === 'string'
                        ? job.result.content
                        : JSON.stringify(job.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
