import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FileUp,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useSession } from '../../hooks/useSession';
import { deleteDocument, uploadDocument } from '../../services/api';

export default function SourceDocumentSelector({
  label = 'Source Document',
  allowNone = false,
  noneLabel = 'General Academic Tutor (No PDF Required)',
  valueOverride = undefined,
  onChangeOverride = undefined,
}) {
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
  const [uploadMsg, setUploadMsg] = useState(null);
  const [uploadErr, setUploadErr] = useState(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    if (!toastMsg) return undefined;
    const timer = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  const readyDocs = documents.filter(
    (d) => d.extracted_text_status === 'completed'
  );

  const currentVal =
    valueOverride !== undefined
      ? valueOverride || ''
      : activeDocumentId || (allowNone ? '' : readyDocs[0]?.id || '');

  const selectedDocObj =
    documents.find((d) => d.id === currentVal) || null;

  const handleSelectChange = (newId) => {
    const normalized = newId && String(newId).trim() ? String(newId).trim() : null;
    if (onChangeOverride) {
      onChangeOverride(normalized);
    } else {
      setActiveDocumentId(normalized || '');
    }
  };

  const handleClearSelection = () => {
    setUploadMsg(null);
    setUploadErr(null);
    if (onChangeOverride) {
      onChangeOverride(null);
    }
    setActiveDocumentId('');
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteDoc) return;
    const targetDoc = confirmDeleteDoc;
    setDeletingId(targetDoc.id);
    setUploadErr(null);
    setUploadMsg(null);

    try {
      const res = await deleteDocument(targetDoc.id);
      const wasActive =
        currentVal === targetDoc.id || activeDocumentId === targetDoc.id;

      removeDocumentFromState(targetDoc.id);
      if (wasActive) {
        if (onChangeOverride) {
          onChangeOverride(null);
        }
        setActiveDocumentId('');
      }

      setConfirmDeleteDoc(null);
      setToastMsg(
        res?.message || `Deleted "${targetDoc.original_filename}" from AI index.`
      );
      await syncDocuments();
      await refreshSession();
    } catch (err) {
      setUploadErr(
        err?.response?.data?.detail ||
          err?.message ||
          'Failed to delete document.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleQuickUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    setUploadErr(null);
    setUploadMsg(null);

    try {
      const uploaded = await uploadDocument(file);
      await syncDocuments();
      await refreshSession();

      if (uploaded.extracted_text_status === 'completed') {
        handleSelectChange(uploaded.id);
        setActiveDocumentId(uploaded.id);
        setUploadMsg(
          `Uploaded & selected "${uploaded.original_filename}"`
        );
      } else {
        setUploadErr(
          uploaded.status_message ||
            `Uploaded "${uploaded.original_filename}" has no selectable text.`
        );
      }
    } catch (err) {
      setUploadErr(
        err?.response?.data?.detail ||
          err?.message ||
          'Failed to upload document.'
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-slate-700">
          {label}
        </label>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Uploading…</span>
            </>
          ) : (
            <>
              <Upload className="h-3 w-3" />
              <span>+ Upload PDF / PPT / DOCX</span>
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx,.ppt,.docx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleQuickUpload}
          disabled={uploading}
          className="hidden"
        />
      </div>

      {/* Dropdown or Direct Upload Button when no documents exist */}
      {!allowNone && readyDocs.length === 0 ? (
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 px-3.5 py-3 text-xs text-indigo-950 transition hover:border-indigo-500 hover:bg-indigo-50/80"
        >
          <div className="flex items-center gap-2">
            <FileUp className="h-4 w-4 shrink-0 text-indigo-600" />
            <span className="font-medium">
              {uploading
                ? 'Extracting & indexing your file…'
                : 'Click here to upload a PDF, PPTX, or DOCX directly'}
            </span>
          </div>
          <span className="ml-2 shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white">
            Browse
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <select
              value={currentVal}
              onChange={(e) => handleSelectChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
            >
              {allowNone && <option value="">{noneLabel}</option>}
              {readyDocs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.original_filename}
                </option>
              ))}
            </select>

            {selectedDocObj && (
              <button
                type="button"
                onClick={() => setConfirmDeleteDoc(selectedDocObj)}
                title="Delete document and remove from AI index?"
                aria-label={`Delete ${selectedDocObj.original_filename}`}
                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50/60 p-2.5 text-red-600 transition hover:bg-red-100 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick Clear Selection & Per-Document Delete List */}
          {allowNone && currentVal && (
            <div className="flex items-center justify-between rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-1.5 text-[11px] text-amber-900">
              <span className="truncate font-medium">
                Active PDF: <strong>{selectedDocObj?.original_filename || 'Selected Document'}</strong>
              </span>
              <button
                type="button"
                onClick={handleClearSelection}
                className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-800 shadow-2xs transition hover:bg-amber-100"
              >
                <X className="h-3 w-3" />
                <span>Clear Document</span>
              </button>
            </div>
          )}

          {documents.length > 0 && (
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                  Indexed Session Files ({documents.length})
                </span>
                {allowNone && currentVal && (
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Reset to General Tutor
                  </button>
                )}
              </div>
              <div className="max-h-36 space-y-1 overflow-y-auto">
                {documents.map((doc) => {
                  const isCurrent = currentVal === doc.id;
                  return (
                    <div
                      key={doc.id}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs transition ${
                        isCurrent
                          ? 'bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200'
                          : 'bg-white text-slate-700 hover:bg-slate-100/80'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectChange(doc.id)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <FileText
                          className={`h-3.5 w-3.5 shrink-0 ${
                            isCurrent ? 'text-indigo-600' : 'text-slate-400'
                          }`}
                        />
                        <span className="truncate font-medium">
                          {doc.original_filename}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        {isCurrent && allowNone && (
                          <button
                            type="button"
                            onClick={handleClearSelection}
                            title="Unlink / Clear Selection"
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200/70"
                          >
                            Clear
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteDoc(doc);
                          }}
                          title="Delete document and remove from AI index?"
                          aria-label={`Delete ${doc.original_filename}`}
                          className=" inline-flex items-center justify-center rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {toastMsg && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-800"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="truncate">{toastMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {uploadMsg && (
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span className="truncate">{uploadMsg}</span>
        </div>
      )}

      {uploadErr && (
        <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-medium text-red-800">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
          <span>{uploadErr}</span>
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
              This will permanently delete{' '}
              <strong>{confirmDeleteDoc.original_filename}</strong>, remove all of
              its indexed chunks from SQLite FTS5, and unlink it from your active
              study session.
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
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingId ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting…</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete Document</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
