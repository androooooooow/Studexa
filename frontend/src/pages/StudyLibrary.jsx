import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Download,
  FileText,
  FolderOpen,
  GraduationCap,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useSession } from '../hooks/useSession';
import {
  deleteDocument,
  deleteLibraryMaterial,
  downloadMaterialPdf,
  fetchLibraryMaterials,
} from '../services/api';

const TABS = [
  { id: 'all', label: 'All Items' },
  { id: 'documents', label: 'Documents' },
  { id: 'summary', label: 'Summaries' },
  { id: 'quiz', label: 'Quizzes' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'exam', label: 'Exams' },
];

const TYPE_META = {
  summary: { icon: Sparkles, color: 'bg-violet-50 text-violet-600', route: '/summarizer' },
  quiz: { icon: BrainCircuit, color: 'bg-amber-50 text-amber-600', route: '/quizzes' },
  flashcards: { icon: BookOpen, color: 'bg-emerald-50 text-emerald-600', route: '/flashcards' },
  exam: { icon: GraduationCap, color: 'bg-rose-50 text-rose-600', route: '/exams' },
};

export default function StudyLibrary() {
  const {
    documents,
    activeDocumentId,
    setActiveDocumentId,
    removeDocumentFromState,
    syncDocuments,
    refreshSession,
  } = useSession();
  const [activeTab, setActiveTab] = useState('all');
  const [materials, setMaterials] = useState([]);
  const [confirmItem, setConfirmItem] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    if (!toastMsg) return undefined;
    const timer = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  const loadMaterials = useCallback(async () => {
    try {
      const list = await fetchLibraryMaterials();
      setMaterials(list);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  const handleConfirmDelete = async () => {
    if (!confirmItem) return;
    const item = confirmItem;
    try {
      if (item.kind === 'document') {
        const res = await deleteDocument(item.id);
        removeDocumentFromState(item.id);
        if (activeDocumentId === item.id) {
          setActiveDocumentId('');
        }
        setToastMsg(
          res?.message || `Deleted "${item.title}" and removed from AI index.`
        );
        await syncDocuments();
      } else {
        await deleteLibraryMaterial(item.id);
        setToastMsg(`Deleted "${item.title}" from Study Library.`);
        await loadMaterials();
      }
      await refreshSession();
    } finally {
      setConfirmItem(null);
    }
  };

  const showDocs = activeTab === 'all' || activeTab === 'documents';
  const filteredMaterials = materials.filter((m) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'documents') return false;
    return m.material_type === activeTab;
  });

  const isEmpty =
    (!showDocs || documents.length === 0) && filteredMaterials.length === 0;

  return (
    <div className="space-y-6">
      {/* Filter Header */}
      {toastMsg && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{toastMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Link
          to="/documents"
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Upload New File</span>
        </Link>
      </div>

      {/* Library Content */}
      {isEmpty ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-2xs">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <FolderOpen className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-slate-900">
              No Items in This Library View
            </h3>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
              All documents you upload and study aids you generate in this browser session are
              stored privately here for quick review, PDF export, or deletion.
            </p>
            <Link
              to="/documents"
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Upload Study Material</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {showDocs && documents.length > 0 && (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Uploaded Documents ({documents.length})
              </h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900">
                          {doc.original_filename}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {doc.chunk_count} FTS5 chunks •{' '}
                          {new Date(doc.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        to="/documents"
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmItem({
                            id: doc.id,
                            title: doc.original_filename,
                            kind: 'document',
                          })
                        }
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredMaterials.length > 0 && (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Generated Study Materials ({filteredMaterials.length})
              </h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {filteredMaterials.map((mat) => {
                  const meta = TYPE_META[mat.material_type] || TYPE_META.summary;
                  const Icon = meta.icon;
                  return (
                    <div
                      key={mat.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.color}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-900">
                            {mat.title}
                          </p>
                          <p className="text-[11px] capitalize text-slate-500">
                            {mat.material_type} •{' '}
                            {new Date(mat.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Link
                          to={meta.route}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={() => downloadMaterialPdf(mat.id, mat.title)}
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                          title="Export as PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmItem({
                              id: mat.id,
                              title: mat.title,
                              kind: 'material',
                            })
                          }
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete material"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Delete Confirmation Modal */}
      {confirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="font-display text-base font-bold text-slate-900">
              {confirmItem.kind === 'document'
                ? 'Delete document and remove from AI index?'
                : 'Confirm Deletion'}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Are you sure you want to delete <strong>{confirmItem.title}</strong>
              {confirmItem.kind === 'document'
                ? ' and remove all of its indexed FTS5 chunks from your session?'
                : ' from your session library?'}
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmItem(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
