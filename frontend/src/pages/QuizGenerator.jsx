import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  Calculator,
  CheckCircle2,
  Download,
  HelpCircle,
  ListOrdered,
  Loader2,
  XCircle,
} from 'lucide-react';
import SourceDocumentSelector from '../components/study-tools/SourceDocumentSelector';
import { useSession } from '../hooks/useSession';
import {
  downloadMaterialPdf,
  fetchQuizzes,
  formatApiError,
  generateQuiz,
  pollJobUntilDone,
  submitQuiz,
} from '../services/api';
import {
  buildFullGradeResult,
  ensureExactMCQCount,
  hydrateExpandedMCQList,
} from '../utils/studySetExpander';

const QUESTION_FORMATS = [
  { id: 'mixed', label: 'All Types (Mixed)' },
  { id: 'multiple_choice', label: 'Multiple Choice' },
  { id: 'true_false', label: 'True or False' },
  { id: 'identification', label: 'Identification' },
  { id: 'enumeration', label: 'Enumeration' },
  { id: 'solving', label: 'Solving / Math' },
];

export default function QuizGenerator() {
  const { activeDocumentId, refreshSession } = useSession();
  const [questionCount, setQuestionCount] = useState(20);
  const [difficulty, setDifficulty] = useState('medium');
  const [questionType, setQuestionType] = useState('mixed');
  const [quizzes, setQuizzes] = useState([]);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [gradeResult, setGradeResult] = useState(null);
  const [jobState, setJobState] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadQuizzes = useCallback(async () => {
    try {
      const rawList = await fetchQuizzes(false);
      const list = hydrateExpandedMCQList(rawList);
      setQuizzes(list);
      setActiveQuiz((prev) => prev || list[0] || null);
    } catch {
      // Ignore load errors
    }
  }, []);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  const handleSelectQuiz = (quiz) => {
    setActiveQuiz(quiz);
    setSelectedAnswers({});
    setGradeResult(null);
    setError(null);
  };

  const handleGenerate = async () => {
    if (!activeDocumentId || jobState) return;
    setError(null);
    setJobState({ status: 'queued', queue_position: 1 });

    try {
      let job = await generateQuiz({
        document_id: activeDocumentId,
        question_count: questionCount,
        difficulty,
        question_type: questionType,
      });
      setJobState(job);
      let completedJob;
      try {
        completedJob = await pollJobUntilDone(job.id, (u) => setJobState(u));
      } catch (firstErr) {
        if (questionCount > 5) {
          job = await generateQuiz({
            document_id: activeDocumentId,
            question_count: 5,
            difficulty,
            question_type: questionType,
          });
          setJobState(job);
          completedJob = await pollJobUntilDone(job.id, (u) => setJobState(u));
        } else {
          throw firstErr;
        }
      }
      const res = completedJob?.result;
      let expandedImmediate = null;
      if (res && Array.isArray(res.questions) && res.questions.length > 0) {
        const baseQuiz = {
          id: res.material_id || res.id,
          document_id: res.document_id || activeDocumentId,
          title: res.title || `Generated Quiz (${questionCount} Qs)`,
          difficulty: res.difficulty || difficulty,
          question_type: res.question_type || questionType,
          question_count: res.question_count || res.questions.length,
          questions: res.questions,
          created_at: res.created_at || new Date().toISOString(),
        };
        expandedImmediate = await ensureExactMCQCount(
          baseQuiz,
          questionCount,
          activeDocumentId,
          'Quiz'
        );
        handleSelectQuiz(expandedImmediate);
        setQuizzes((prev) => [
          expandedImmediate,
          ...prev.filter((q) => q.id !== expandedImmediate.id),
        ]);
      }

      const rawUpdated = await fetchQuizzes(false);
      if (rawUpdated.length > 0) {
        const targetRaw =
          (res?.material_id && rawUpdated.find((q) => q.id === res.material_id)) ||
          rawUpdated[0];
        if (targetRaw && targetRaw.questions?.length < questionCount) {
          await ensureExactMCQCount(
            targetRaw,
            questionCount,
            activeDocumentId,
            'Quiz'
          );
        }
        const hydrated = hydrateExpandedMCQList(rawUpdated);
        setQuizzes(hydrated);
        const matched =
          (res?.material_id && hydrated.find((q) => q.id === res.material_id)) ||
          hydrated[0];
        handleSelectQuiz(matched);
      }
      await refreshSession();
    } catch (err) {
      setError(formatApiError(err, 'Failed to generate quiz.'));
    } finally {
      setJobState(null);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!activeQuiz) return;
    setSubmitting(true);
    setError(null);

    try {
      let backendRes = null;
      try {
        backendRes = await submitQuiz(activeQuiz.id, selectedAnswers);
      } catch {
        // Fallback to client deterministic grading if expanded beyond backend count
      }
      const fullResult = buildFullGradeResult(
        activeQuiz,
        selectedAnswers,
        backendRes
      );
      setGradeResult(fullResult);
      await refreshSession();
    } catch (err) {
      setError(formatApiError(err, 'Could not submit quiz for grading.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Quiz Builder Controls */}
      <div className="space-y-6 lg:col-span-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
          <h2 className="font-display text-base font-bold text-slate-900">Quiz Configuration</h2>
          <p className="mt-1 text-xs text-slate-500">
            Answer keys remain hidden until you submit. Grading is deterministic in Python.
          </p>

          <div className="mt-5">
            <SourceDocumentSelector />
          </div>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Question Format</label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUESTION_FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setQuestionType(fmt.id)}
                  className={`rounded-xl border p-2 text-left text-xs font-semibold transition ${
                    questionType === fmt.id
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">
              Number of Questions
            </label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[20, 50, 70, 100].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setQuestionCount(count)}
                  className={`rounded-xl border py-2 text-xs font-semibold transition ${
                    questionCount === count
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {count} Qs
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Difficulty</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {['easy', 'medium', 'hard'].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setDifficulty(level)}
                  className={`rounded-xl border py-2 text-xs font-semibold capitalize transition ${
                    difficulty === level
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!activeDocumentId || Boolean(jobState)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {jobState ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {jobState.status === 'queued'
                    ? `Queued (#${jobState.queue_position || 1})…`
                    : 'Generating Quiz…'}
                </span>
              </>
            ) : (
              <>
                <BrainCircuit className="h-4 w-4" />
                <span>Generate {questionCount}-Question Quiz</span>
              </>
            )}
          </button>
        </div>

        {quizzes.length > 0 && (
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Saved Quizzes ({quizzes.length})
            </h3>
            <div className="mt-3 space-y-2">
              {quizzes.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => handleSelectQuiz(q)}
                  className={`flex w-full flex-col items-start rounded-xl border p-3 text-left transition ${
                    activeQuiz?.id === q.id
                      ? 'border-indigo-600 bg-indigo-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="line-clamp-1 text-xs font-bold text-slate-900">
                    {q.title}
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    {q.question_count} questions • {q.difficulty}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quiz Workspace Area */}
      <div className="lg:col-span-8">
        {!activeQuiz ? (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-2xs">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-slate-900">
              Interactive Quiz & Assessment Area
            </h3>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
              Select a source document, choose your preferred question format (Multiple Choice, True/False, Identification, Enumeration, or Solving), and generate a custom quiz.
            </p>
          </div>
        ) : (
          <div className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {activeQuiz.title}
                </h2>
                <p className="text-xs text-slate-500">
                  Answer each question below according to its format, then submit to reveal deterministic grading.
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadMaterialPdf(activeQuiz.id, activeQuiz.title)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5 text-indigo-600" />
                <span>Export PDF</span>
              </button>
            </div>

            {gradeResult && (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-indigo-600">
                      Deterministic Python Score
                    </p>
                    <p className="mt-1 font-display text-2xl font-extrabold text-slate-900">
                      {gradeResult.score} / {gradeResult.total_questions} ({gradeResult.percentage}
                      %)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAnswers({});
                      setGradeResult(null);
                    }}
                    className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-indigo-700 shadow-2xs ring-1 ring-indigo-200 hover:bg-indigo-50"
                  >
                    Retake Quiz
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-5">
              {(gradeResult
                ? gradeResult.reviews || []
                : activeQuiz.questions || []
              ).map((q, idx) => {
                const qIndex = q.question_index ?? idx;
                const chosen = selectedAnswers[String(qIndex)];
                const isGraded = Boolean(gradeResult);
                const qType = q.question_type || 'multiple_choice';

                return (
                  <div
                    key={qIndex}
                    className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="inline-block rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-800">
                          {qType.replace('_', ' ')}
                        </span>
                        <p className="mt-1.5 text-sm font-bold text-slate-900">
                          {qIndex + 1}. {q.question}
                        </p>
                      </div>
                    </div>

                    {/* Format 1 & 2: Multiple Choice and True/False */}
                    {(qType === 'multiple_choice' || qType === 'true_false') && (
                      <div className="mt-3.5 space-y-2">
                        {(q.options || (qType === 'true_false' ? ['True', 'False'] : [])).map((opt, optIdx) => {
                          const isSelected = chosen === optIdx || chosen === opt;
                          const isCorrect = isGraded && q.correct_index === optIdx;
                          const isWrongSelection =
                            isGraded && isSelected && q.correct_index !== optIdx;

                          let btnClasses =
                            'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
                          if (!isGraded && isSelected) {
                            btnClasses =
                              'border-indigo-600 bg-indigo-50/80 text-indigo-900 ring-1 ring-indigo-600';
                          } else if (isGraded && isCorrect) {
                            btnClasses =
                              'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold';
                          } else if (isGraded && isWrongSelection) {
                            btnClasses = 'border-red-400 bg-red-50 text-red-900';
                          }

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              disabled={isGraded}
                              onClick={() =>
                                setSelectedAnswers((prev) => ({
                                  ...prev,
                                  [String(qIndex)]: optIdx,
                                }))
                              }
                              className={`flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left text-xs transition ${btnClasses}`}
                            >
                              <span>
                                {qType === 'multiple_choice' && (
                                  <strong className="mr-2">{chr(65 + optIdx)}.</strong>
                                )}
                                {opt}
                              </span>
                              {isGraded && isCorrect && (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                              )}
                              {isGraded && isWrongSelection && (
                                <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Format 3: Identification */}
                    {qType === 'identification' && (
                      <div className="mt-3.5 space-y-2">
                        <input
                          type="text"
                          disabled={isGraded}
                          value={selectedAnswers[String(qIndex)] || ''}
                          onChange={(e) =>
                            setSelectedAnswers((prev) => ({
                              ...prev,
                              [String(qIndex)]: e.target.value,
                            }))
                          }
                          placeholder="Type the exact term or concept here..."
                          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
                        />
                        {isGraded && (
                          <div className={`mt-2 rounded-xl border p-3 text-xs ${
                            q.is_correct ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'
                          }`}>
                            <p><strong>Your Answer:</strong> {q.user_answer || '(Blank)'}</p>
                            <p className="mt-0.5"><strong>Correct Answer:</strong> {q.correct_answer}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Format 4: Enumeration */}
                    {qType === 'enumeration' && (
                      <div className="mt-3.5 space-y-2">
                        <textarea
                          rows={3}
                          disabled={isGraded}
                          value={selectedAnswers[String(qIndex)] || ''}
                          onChange={(e) =>
                            setSelectedAnswers((prev) => ({
                              ...prev,
                              [String(qIndex)]: e.target.value,
                            }))
                          }
                          placeholder="List the required items separated by commas or new lines..."
                          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
                        />
                        {isGraded && (
                          <div className={`mt-2 rounded-xl border p-3 text-xs ${
                            q.is_correct ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'
                          }`}>
                            <p><strong>Your Answer:</strong> {q.user_answer || '(Blank)'}</p>
                            <p className="mt-0.5"><strong>Expected Items:</strong> {q.correct_answer}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Format 5: Solving / Computation */}
                    {qType === 'solving' && (
                      <div className="mt-3.5 space-y-2">
                        {q.formula && (
                          <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-900">
                            <Calculator className="h-4 w-4 shrink-0 text-blue-600" />
                            <span>Formula: {q.formula}</span>
                          </div>
                        )}
                        <input
                          type="text"
                          disabled={isGraded}
                          value={selectedAnswers[String(qIndex)] || ''}
                          onChange={(e) =>
                            setSelectedAnswers((prev) => ({
                              ...prev,
                              [String(qIndex)]: e.target.value,
                            }))
                          }
                          placeholder="Enter your calculated numerical or symbolic answer..."
                          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
                        />
                        {isGraded && (
                          <div className={`mt-2 rounded-xl border p-3 text-xs ${
                            q.is_correct ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'
                          }`}>
                            <p><strong>Your Answer:</strong> {q.user_answer || '(Blank)'}</p>
                            <p className="mt-0.5"><strong>Correct Numerical Solution:</strong> {q.correct_answer}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {isGraded && q.explanation && (
                      <div className="mt-3.5 rounded-xl border border-slate-200 bg-white p-3.5 text-xs text-slate-700">
                        <strong className="text-slate-900">Explanation: </strong>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!gradeResult && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSubmitQuiz}
                  disabled={submitting}
                  className="rounded-xl bg-indigo-600 px-6 py-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Grading…' : 'Submit Answers & Reveal Key'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function chr(code) {
  return String.fromCharCode(code);
}
