import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  FileUp,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import JobQueuePanel from '../components/jobs/JobQueuePanel';
import { useSession } from '../hooks/useSession';
import {
  createAIJob,
  deleteDocument,
  fetchDocumentDetail,
  uploadDocument,
} from '../services/api';

function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function PDFAnalyzer() {
  const fileInputRef = useRef(null);
  const {
    documents,
    activeDocumentId,
    setActiveDocumentId,
    removeDocumentFromState,
    syncDocuments,
    refreshSession,
  } = useSession();

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  const [inspectDoc, setInspectDoc] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [submittingJobDocId, setSubmittingJobDocId] = useState(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const uploaded = await uploadDocument(file);
      await syncDocuments();
      await refreshSession();
      if (uploaded.extracted_text_status === 'completed') {
        setActiveDocumentId(uploaded.id);
        setUploadSuccess(
          `Uploaded "${uploaded.original_filename}" and indexed ${uploaded.chunk_count} chunk(s) in SQLite FTS5.`
        );
      } else {
        setUploadSuccess(
          uploaded.status_message ||
            `Uploaded "${uploaded.original_filename}" with status: ${uploaded.extracted_text_status}.`
        );
      }
    } catch (err) {
      setUploadError(
        err?.response?.data?.detail ||
          err?.message ||
          'Failed to upload document.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleInspectChunks = async (docId) => {
    setInspectLoading(true);
    try {
      const detail = await fetchDocumentDetail(docId);
      setInspectDoc(detail);
    } catch (err) {
      setUploadError(
        err?.response?.data?.detail || 'Could not load document chunks.'
      );
    } finally {
      setInspectLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteDoc) return;
    const targetDoc = confirmDeleteDoc;
    setDeletingId(targetDoc.id);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const res = await deleteDocument(targetDoc.id);
      removeDocumentFromState(targetDoc.id);
      if (activeDocumentId === targetDoc.id) {
        setActiveDocumentId('');
      }
      if (inspectDoc?.id === targetDoc.id) {
        setInspectDoc(null);
      }
      setConfirmDeleteDoc(null);
      setUploadSuccess(
        res?.message ||
          `Deleted "${targetDoc.original_filename}" and removed from AI index.`
      );
      await syncDocuments();
      await refreshSession();
    } catch (err) {
      setUploadError(
        err?.response?.data?.detail || 'Could not delete document.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleEnqueueQuickOverview = async (doc) => {
    setSubmittingJobDocId(doc.id);
    setUploadError(null);
    try {
      await createAIJob({
        job_type: 'document_overview',
        document_id: doc.id,
        prompt: `Provide a concise study overview and key concepts for ${doc.original_filename}.`,
      });
      setQueueRefreshKey((k) => k + 1);
      await refreshSession();
    } catch (err) {
      setUploadError(
        err?.response?.data?.detail || 'Could not enqueue AI job.'
      );
    } finally {
      setSubmittingJobDocId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Upload PDF, PPTX/PPT, or DOCX Study Material
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Validated up to <strong>20 MB</strong>. Extracted slide text and lecture notes are split into chunks and
              indexed in SQLite FTS5 under your private session.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Search className="h-3.5 w-3.5" />
            SQLite FTS5 Search Ready
          </span>
        </div>

        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`mt-5 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-11 text-center transition ${
            uploading
              ? 'cursor-wait border-indigo-300 bg-indigo-50/30'
              : 'cursor-pointer border-slate-300 bg-slate-50/70 hover:border-indigo-400 hover:bg-indigo-50/30'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.pptx,.ppt,.docx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <FileUp className="h-6 w-6" />
            )}
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-900">
            {uploading
              ? 'Uploading, extracting text & indexing chunks…'
              : 'Click to select a PDF, PPTX/PPT, or DOCX document'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Maximum file size: 20 MB • Stored privately in your anonymous session
          </p>
        </div>

        {uploadError && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{uploadError}</span>
          </div>
        )}

        {uploadSuccess && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{uploadSuccess}</span>
          </div>
        )}

        {/* Scanned PDF / OCR Notice */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p>
            <strong>Scanned PDFs Notice:</strong> Please upload text-selectable PDF or Word
            documents. Scanned or image-only PDFs without embedded text will be flagged because OCR
            is not included in v1.0.
          </p>
        </div>
      </div>

      {/* Session Documents List */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              Your Session Documents ({documents.length})
            </h3>
            <p className="text-xs text-slate-500">
              Select a document as your active study source, inspect extracted FTS5 chunks, or test
              the AI Queue.
            </p>
          </div>
          {activeDocumentId && (
            <button
              type="button"
              onClick={() => setActiveDocumentId('')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
              <span>Clear Active Selection</span>
            </button>
          )}
        </div>

        {documents.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
            <FileText className="h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-800">
              No documents uploaded yet
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Upload a PDF or DOCX above to extract text chunks and unlock AI study tools.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {documents.map((doc) => {
              const isSelected = doc.id === activeDocumentId;
              const isReady = doc.extracted_text_status === 'completed';

              return (
                <div
                  key={doc.id}
                  className={`rounded-2xl border p-4 transition ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/30 ring-1 ring-indigo-600'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isReady
                            ? 'bg-indigo-50 text-indigo-600'
                            : 'bg-amber-50 text-amber-600'
                        }`}
                      >
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate font-display text-sm font-bold text-slate-900">
                            {doc.original_filename}
                          </h4>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                            {doc.file_type}
                          </span>
                          {isSelected && (
                            <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                              Active Study Source
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span>{formatBytes(doc.file_size)}</span>
                          <span>•</span>
                          <span
                            className={
                              isReady
                                ? 'font-semibold text-emerald-700'
                                : 'font-semibold text-amber-700'
                            }
                          >
                            {isReady
                              ? `${doc.chunk_count} FTS5 chunk(s) indexed`
                              : doc.extracted_text_status === 'scanned_no_ocr'
                              ? 'Scanned PDF (No OCR)'
                              : 'No extractable text'}
                          </span>
                          <span>•</span>
                          <span>{new Date(doc.created_at).toLocaleString()}</span>
                        </div>
                        {doc.status_message && (
                          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                            {doc.status_message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {isReady && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveDocumentId(isSelected ? '' : doc.id)
                            }
                            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                              isSelected
                                ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200/70'
                                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {isSelected ? 'Clear Selection' : 'Use as Source'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleInspectChunks(doc.id)}
                            disabled={inspectLoading}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Chunks</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleEnqueueQuickOverview(doc)}
                            disabled={submittingJobDocId === doc.id}
                            className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>
                              {submittingJobDocId === doc.id
                                ? 'Queueing…'
                                : 'Queue AI Overview'}
                            </span>
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteDoc(doc)}
                        className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        title="Delete document"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Phase 3 AI Job Queue Panel */}
      <JobQueuePanel refreshTrigger={queueRefreshKey} />

      {/* Chunk Inspector Modal */}
      {inspectDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="flex max-h-[82vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Indexed Chunks — {inspectDoc.original_filename}
                </h3>
                <p className="text-xs text-slate-500">
                  {inspectDoc.chunk_count} chunk(s) indexed in SQLite FTS5
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectDoc(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-6">
              {inspectDoc.chunks.map((ch) => (
                <div
                  key={ch.chunk_index}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <span className="inline-block rounded-md bg-indigo-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-800">
                    Chunk #{ch.chunk_index + 1}
                  </span>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                    {ch.chunk_text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="font-display text-base font-bold text-slate-900">
              Delete document and remove from AI index?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Are you sure you want to permanently remove{' '}
              <strong>{confirmDeleteDoc.original_filename}</strong> and all of its indexed FTS5
              chunks from your session?
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDeleteDoc(null)}
                disabled={Boolean(deletingId)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={Boolean(deletingId)}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingId ? 'Deleting…' : 'Delete Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
