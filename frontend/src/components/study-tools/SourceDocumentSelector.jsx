import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Upload } from 'lucide-react';
import { useSession } from '../../hooks/useSession';

export default function SourceDocumentSelector({ label = 'Source Document' }) {
  const { documents, activeDocumentId, setActiveDocumentId } = useSession();
  const readyDocs = documents.filter((d) => d.extracted_text_status === 'completed');

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-slate-700">{label}</label>
        <Link
          to="/documents"
          className="text-[11px] font-semibold text-indigo-600 hover:underline"
        >
          + Upload New
        </Link>
      </div>

      {readyDocs.length === 0 ? (
        <div className="mt-1.5 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900">
          <span className="truncate">No indexed documents yet</span>
          <Link
            to="/documents"
            className="ml-2 inline-flex shrink-0 items-center gap-1 font-semibold text-indigo-600 hover:underline"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload PDF/DOCX</span>
          </Link>
        </div>
      ) : (
        <div className="relative mt-1.5">
          <select
            value={activeDocumentId || readyDocs[0]?.id || ''}
            onChange={(e) => setActiveDocumentId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
          >
            {readyDocs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.original_filename} ({doc.chunk_count} chunks)
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
