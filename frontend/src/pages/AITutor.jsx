import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Globe,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import SourceDocumentSelector from '../components/study-tools/SourceDocumentSelector';
import { useSession } from '../hooks/useSession';
import {
  fetchTutorConversationDetail,
  fetchTutorConversations,
  formatApiError,
  pollJobUntilDone,
  sendTutorQuestion,
} from '../services/api';

const SAMPLE_STUDY_QUESTIONS = [
  'Explain the difference between mitosis and meiosis in biology.',
  'How do you solve systems of linear equations using substitution?',
  'What were the primary causes and consequences of World War I?',
  'Explain the core principles of Object-Oriented Programming (OOP).',
];

export default function AITutor() {
  const { documents, activeDocumentId, setActiveDocumentId, refreshSession } =
    useSession();

  // null represents General Academic Tutor (No PDF Required)
  const [selectedDocumentId, setSelectedDocumentId] = useState(
    activeDocumentId || null
  );
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [question, setQuestion] = useState('');
  const [jobState, setJobState] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const initialLoadedRef = useRef(false);

  // Sync with activeDocumentId when it changes externally (or clears when deleted)
  useEffect(() => {
    setSelectedDocumentId(activeDocumentId || null);
  }, [activeDocumentId]);

  // If the currently selected document was deleted from session documents, reset to null
  useEffect(() => {
    if (
      selectedDocumentId &&
      documents.length > 0 &&
      !documents.some((d) => d.id === selectedDocumentId)
    ) {
      setSelectedDocumentId(null);
    } else if (selectedDocumentId && documents.length === 0) {
      setSelectedDocumentId(null);
    }
  }, [documents, selectedDocumentId]);

  const handleChangeDocMode = (val) => {
    const cleanId = val && String(val).trim() ? String(val).trim() : null;
    setSelectedDocumentId(cleanId);
    setActiveDocumentId(cleanId || '');
  };

  const handleStartNewConversation = () => {
    setActiveConversation(null);
    setQuestion('');
    setError(null);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const loadConversationDetail = useCallback(async (convId) => {
    try {
      const detail = await fetchTutorConversationDetail(convId);
      setActiveConversation(detail);
    } catch {
      // Ignore
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const list = await fetchTutorConversations();
      setConversations(list);
      if (list.length > 0 && !initialLoadedRef.current) {
        initialLoadedRef.current = true;
        await loadConversationDetail(list[0].id);
      }
    } catch {
      // Ignore
    }
  }, [loadConversationDetail]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const submitQuestion = async (rawQuestion) => {
    const trimmed = (rawQuestion || '').trim();
    if (!trimmed || jobState) return;

    setQuestion('');
    setError(null);
    setJobState({ status: 'queued', queue_position: 1 });

    try {
      const effectiveDocId =
        selectedDocumentId &&
        documents.some((d) => d.id === selectedDocumentId)
          ? selectedDocumentId
          : null;
      const job = await sendTutorQuestion({
        document_id: effectiveDocId,
        question: trimmed,
        conversation_id: activeConversation?.id || null,
      });
      const convId = job.payload?.options?.conversation_id;
      if (convId) {
        await loadConversationDetail(convId);
      }
      setJobState(job);
      await pollJobUntilDone(job.id, (u) => setJobState(u));

      const updatedConvs = await fetchTutorConversations();
      setConversations(updatedConvs);
      if (convId) {
        await loadConversationDetail(convId);
      }
      await refreshSession();
    } catch (err) {
      setError(
        formatApiError(
          err,
          'Only academic and study-related questions are allowed.'
        )
      );
    } finally {
      setJobState(null);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    await submitQuestion(question);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Conversation History & Mode Selector */}
      <div className="space-y-4 lg:col-span-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-slate-900">
              AI Study Tutor
            </h2>
            <button
              type="button"
              onClick={handleStartNewConversation}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Convo</span>
            </button>
          </div>

          {/* Optional Document or General Academic Selector with Direct Inline Upload */}
          <div className="mt-4">
            <SourceDocumentSelector
              label="Knowledge Source (PDF Optional)"
              allowNone={true}
              noneLabel="General Academic Tutor (No PDF Required)"
              valueOverride={selectedDocumentId || ''}
              onChangeOverride={handleChangeDocMode}
            />
          </div>

          {/* Strict Academic Guardrail Notice */}
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-[11px] leading-relaxed text-indigo-950">
            <p className="font-bold text-indigo-800">
              Strictly Academic &amp; Study Only:
            </p>
            <p className="mt-0.5 text-indigo-900/80">
              Covers all school subjects, homework questions, concepts, and
              uploaded course files. Questions unrelated to school or learning
              will return an error.
            </p>
          </div>
        </div>

        {/* Sample Study Questions */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <h3 className="font-display text-xs font-bold tracking-wider text-slate-500 uppercase">
            Quick Study Prompts
          </h3>
          <div className="mt-3 space-y-2">
            {SAMPLE_STUDY_QUESTIONS.map((sample) => (
              <button
                key={sample}
                type="button"
                disabled={Boolean(jobState)}
                onClick={() => submitQuestion(sample)}
                className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 p-2.5 text-left text-xs text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50/50 disabled:opacity-50"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation History */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Session Conversations ({conversations.length})
            </h3>
            <button
              type="button"
              onClick={handleStartNewConversation}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              <Plus className="h-3 w-3" />
              <span>New Convo</span>
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {!activeConversation && (
              <div className="flex w-full flex-col items-start rounded-xl border border-indigo-600 bg-indigo-50/70 p-3 text-left">
                <span className="text-xs font-bold text-indigo-900">
                  ✨ New Conversation (Active)
                </span>
                <span className="mt-0.5 text-[11px] text-indigo-700">
                  Type a question on the right to start this thread
                </span>
              </div>
            )}
            {conversations.length === 0 ? (
              <p className="text-xs text-slate-500">
                Ask your first study question to save a conversation.
              </p>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => {
                    setError(null);
                    loadConversationDetail(conv.id);
                  }}
                  className={`flex w-full flex-col items-start rounded-xl border p-3 text-left transition ${
                    activeConversation?.id === conv.id
                      ? 'border-indigo-600 bg-indigo-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="line-clamp-1 text-xs font-bold text-slate-900">
                    {conv.title}
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    {conv.document_id ? 'Document-Grounded' : 'General Academic'} •{' '}
                    {new Date(conv.created_at).toLocaleTimeString()}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Chat Window */}
      <div className="flex h-[calc(100vh-11rem)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs lg:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">
                {activeConversation
                  ? activeConversation.title
                  : 'New Study Conversation'}
              </p>
              <p className="text-[11px] text-slate-500">
                {selectedDocumentId
                  ? 'Grounded in selected PDF/DOCX + General Academic Knowledge'
                  : 'Standalone Study Mode (No PDF required)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartNewConversation}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-2xs transition hover:bg-indigo-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Convo</span>
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Academic &amp; Study Only</span>
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {!activeConversation || activeConversation.messages?.length === 0 ? (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xs font-bold text-white">
                AI
              </div>
              <div className="max-w-2xl rounded-2xl rounded-tl-xs border border-slate-200/80 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
                <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-800">
                  <ShieldCheck className="h-3 w-3" />
                  AI Study Tutor — All Subjects (Works With or Without PDF)
                </div>
                <p>
                  Welcome! You can ask me any <strong>academic or study question</strong>{' '}
                  right now—even without uploading a PDF (Math, Science, History,
                  Literature, Business, Coding, and more)—or select an
                  uploaded document on the left for source-grounded answers.
                </p>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Note: Friendly greetings are always welcome, but questions
                  unrelated to school or learning are automatically blocked with
                  an error.
                </p>
              </div>
            </div>
          ) : (
            activeConversation.messages.map((msg) => {
              const isUser = msg.role === 'user';
              const isGrounded = msg.metadata?.source_grounded === true;

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${
                    isUser ? 'flex-row-reverse' : ''
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                      isUser
                        ? 'bg-slate-900 text-white'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {isUser ? 'You' : 'AI'}
                  </div>

                  <div
                    className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                      isUser
                        ? 'rounded-tr-xs bg-indigo-600 text-white'
                        : 'rounded-tl-xs border border-slate-200/80 bg-slate-50 text-slate-800'
                    }`}
                  >
                    {!isUser && msg.metadata && (
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                            isGrounded
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {isGrounded ? (
                            <ShieldCheck className="h-3 w-3" />
                          ) : (
                            <Globe className="h-3 w-3" />
                          )}
                          <span>{msg.metadata.knowledge_label}</span>
                        </span>
                        {msg.metadata.cited_chunks?.length > 0 && (
                          <span className="text-[10px] font-medium text-slate-500">
                            Citations:{' '}
                            {msg.metadata.cited_chunks
                              .map((c) => `§${c}`)
                              .join(', ')}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              );
            })
          )}

          {jobState && (
            <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-2.5 text-xs text-indigo-800">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              <span>
                {jobState.status === 'queued'
                  ? `Waiting in FIFO queue (Position #${jobState.queue_position || 1})…`
                  : 'Generating study explanation with Gemma 3 1B…'}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-xs text-red-900 shadow-2xs">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <p className="font-bold text-red-800">
                  Off-Topic / Invalid Question Error
                </p>
                <p className="mt-1 leading-relaxed">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Composer — Always enabled even without an uploaded PDF */}
        <form
          onSubmit={handleSend}
          className="border-t border-slate-100 bg-white p-4"
        >
          <div className="flex items-center gap-2.5">
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={Boolean(jobState)}
              placeholder={
                selectedDocumentId
                  ? 'Ask a study question about your selected document…'
                  : 'Ask any academic or study question (Math, Science, History, Coding...)'
              }
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!question.trim() || Boolean(jobState)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Ask Tutor</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
