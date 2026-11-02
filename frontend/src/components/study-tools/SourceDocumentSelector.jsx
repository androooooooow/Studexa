import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  Upload,
} from 'lucide-react';
import { useSession } from '../../hooks/useSession';
import { uploadDocument } from '../../services/api';

export default function SourceDocumentSelector({
  label = 'Source Document',
  allowNone = false,
  noneLabel = 'General Accountancy Tutor (No PDF Required)',
  valueOverride = undefined,
  onChangeOverride = undefined,
}) {
  const fileInputRef = useRef(null);
  const {
    documents,
    activeDocumentId,
    setActiveDocumentId,
    syncDocuments,
    refreshSession,
  } = useSession();

  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [uploadErr, setUploadErr] = useState(null);

  const readyDocs = documents.filter(
    (d) => d.extracted_text_status === 'completed'
  );

  const currentVal =
    valueOverride !== undefined
      ? valueOverride
      : activeDocumentId || (allowNone ? '' : readyDocs[0]?.id || '');

  const handleSelectChange = (newId) => {
    if (onChangeOverride) {
      onChangeOverride(newId);
    } else {
      setActiveDocumentId(newId);
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
          `Uploaded & selected "${uploaded.original_filename}" (${uploaded.chunk_count} chunks)`
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
    <div className="space-y-2">
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
        <select
          value={currentVal}
          onChange={(e) => handleSelectChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
        >
          {allowNone && <option value="">{noneLabel}</option>}
          {readyDocs.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.original_filename} ({doc.chunk_count} chunks)
            </option>
          ))}
        </select>
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
    </div>
  );
}
