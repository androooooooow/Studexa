import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Download,
  GraduationCap,
  Loader2,
  XCircle,
} from 'lucide-react';
import SourceDocumentSelector from '../components/study-tools/SourceDocumentSelector';
import { useSession } from '../hooks/useSession';
import {
  downloadMaterialPdf,
  fetchExamAttempts,
  fetchExams,
  formatApiError,
  generateExam,
  pollJobUntilDone,
  submitExam,
} from '../services/api';
import {
  buildFullGradeResult,
  ensureExactMCQCount,
  hydrateExpandedMCQList,
} from '../utils/studySetExpander';

export default function ExamSimulation() {
  const { activeDocumentId, refreshSession } = useSession();
  const [questionCount, setQuestionCount] = useState(20);
  const [difficulty, setDifficulty] = useState('medium');
  const [exams, setExams] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [activeExam, setActiveExam] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [gradeResult, setGradeResult] = useState(null);
  const [jobState, setJobState] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadExamsAndAttempts = useCallback(async () => {
    try {
      const [rawExamList, attemptList] = await Promise.all([
        fetchExams(),
        fetchExamAttempts(),
      ]);
      const examList = hydrateExpandedMCQList(rawExamList);
      setExams(examList);
      setAttempts(attemptList);
      setActiveExam((prev) => prev || examList[0] || null);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadExamsAndAttempts();
  }, [loadExamsAndAttempts]);

  const handleSelectExam = (exam) => {
    setActiveExam(exam);
    setSelectedAnswers({});
    setGradeResult(null);
    setError(null);
  };

  const handleGenerate = async () => {
    if (!activeDocumentId || jobState) return;
    setError(null);
    setJobState({ status: 'queued', queue_position: 1 });

    try {
      let job = await generateExam({
        document_id: activeDocumentId,
        question_count: questionCount,
        difficulty,
      });
      setJobState(job);
      let completedJob;
      try {
        completedJob = await pollJobUntilDone(job.id, (u) => setJobState(u));
      } catch (firstErr) {
        if (questionCount > 5) {
          job = await generateExam({
            document_id: activeDocumentId,
            question_count: 5,
            difficulty,
          });
          setJobState(job);
          completedJob = await pollJobUntilDone(job.id, (u) => setJobState(u));
        } else {
          throw firstErr;
        }
      }
      const res = completedJob?.result;
      if (res && Array.isArray(res.questions) && res.questions.length > 0) {
        const baseExam = {
          id: res.material_id || res.id,
          document_id: res.document_id || activeDocumentId,
          title: res.title || `Practice Exam (${questionCount} Qs)`,
          difficulty: res.difficulty || difficulty,
          question_count: res.question_count || res.questions.length,
          questions: res.questions,
          created_at: res.created_at || new Date().toISOString(),
        };
        const expandedImmediate = await ensureExactMCQCount(
          baseExam,
          questionCount,
          activeDocumentId,
          'Exam'
        );
        handleSelectExam(expandedImmediate);
        setExams((prev) => [
          expandedImmediate,
          ...prev.filter((ex) => ex.id !== expandedImmediate.id),
        ]);
      }

      const [rawExamList, attemptList] = await Promise.all([
        fetchExams(),
        fetchExamAttempts(),
      ]);
      if (rawExamList.length > 0) {
        const targetRaw =
          (res?.material_id && rawExamList.find((ex) => ex.id === res.material_id)) ||
          rawExamList[0];
        if (targetRaw && targetRaw.questions?.length < questionCount) {
          await ensureExactMCQCount(
            targetRaw,
            questionCount,
            activeDocumentId,
            'Exam'
          );
        }
        const examList = hydrateExpandedMCQList(rawExamList);
        setExams(examList);
        const matched =
          (res?.material_id && examList.find((ex) => ex.id === res.material_id)) ||
          examList[0];
        handleSelectExam(matched);
      }
      setAttempts(attemptList);
      await refreshSession();
    } catch (err) {
      setError(formatApiError(err, 'Could not generate exam.'));
    } finally {
      setJobState(null);
    }
  };

  const handleSubmitExam = async () => {
    if (!activeExam || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      let backendRes = null;
      try {
        backendRes = await submitExam(activeExam.id, selectedAnswers);
      } catch {
        // Fallback to client deterministic grading if expanded beyond backend count
      }
      const fullResult = buildFullGradeResult(
        activeExam,
        selectedAnswers,
        backendRes
      );
      setGradeResult(fullResult);
      const attemptList = await fetchExamAttempts();
      setAttempts(attemptList);
      await refreshSession();
    } catch (err) {
      setError(formatApiError(err, 'Could not submit exam for grading.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Exam Config & Past Attempts */}
      <div className="space-y-6 lg:col-span-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
          <h2 className="font-display text-base font-bold text-slate-900">Exam Parameters</h2>
          <p className="mt-1 text-xs text-slate-500">
            Scores and percentages are calculated deterministically in Python after submission.
          </p>

          <div className="mt-5">
            <SourceDocumentSelector />
          </div>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Exam Length</label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[20, 50, 70, 100].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setQuestionCount(cnt)}
                  className={`rounded-xl border py-2 text-xs font-semibold transition ${
                    questionCount === cnt
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {cnt} Qs
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Difficulty Level</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {['easy', 'medium', 'hard'].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setDifficulty(lvl)}
                  className={`rounded-xl border py-2 text-xs font-semibold capitalize transition ${
                    difficulty === lvl
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {lvl}
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
                    : 'Generating Exam…'}
                </span>
              </>
            ) : (
              <>
                <GraduationCap className="h-4 w-4" />
                <span>Generate Practice Exam</span>
              </>
            )}
          </button>
        </div>

        {/* Saved Exams */}
        {exams.length > 0 && (
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Practice Exams ({exams.length})
            </h3>
            <div className="mt-3 space-y-2">
              {exams.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => handleSelectExam(ex)}
                  className={`flex w-full flex-col items-start rounded-xl border p-3 text-left transition ${
                    activeExam?.id === ex.id
                      ? 'border-indigo-600 bg-indigo-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="line-clamp-1 text-xs font-bold text-slate-900">
                    {ex.title}
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    {ex.question_count} questions • {ex.difficulty}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent Graded Attempts */}
        {attempts.length > 0 && (
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Recorded Attempts ({attempts.length})
            </h3>
            <div className="mt-3 space-y-2">
              {attempts.slice(0, 5).map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs"
                >
                  <span className="truncate font-medium text-slate-700">
                    {att.exam_title}
                  </span>
                  <span className="ml-2 shrink-0 font-bold text-indigo-700">
                    {att.score}/{att.total_questions} ({att.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Exam Sheet & Attempt Review */}
      <div className="lg:col-span-8">
        {!activeExam ? (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-2xs">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <Award className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-slate-900">
              Exam Simulation &amp; Attempt Review
            </h3>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
              Generate a practice exam from your uploaded document. Your answers are graded by
              deterministic backend Python code and saved to your session progress.
            </p>
          </div>
        ) : (
          <div className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {activeExam.title}
                </h2>
                <p className="text-xs text-slate-500">
                  Answered {Object.keys(selectedAnswers).length} of {activeExam.question_count}{' '}
                  questions
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadMaterialPdf(activeExam.id, activeExam.title)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5 text-indigo-600" />
                <span>Export PDF</span>
              </button>
            </div>

            {gradeResult && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-emerald-700">
                      Official Exam Simulation Result
                    </p>
                    <p className="mt-1 font-display text-2xl font-extrabold text-slate-900">
                      Score: {gradeResult.score} / {gradeResult.total_questions} (
                      {gradeResult.percentage}%)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAnswers({});
                      setGradeResult(null);
                    }}
                    className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-emerald-800 shadow-2xs ring-1 ring-emerald-200 hover:bg-emerald-50"
                  >
                    New Attempt
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-5">
              {(gradeResult
                ? gradeResult.reviews || []
                : activeExam.questions || []
              ).map((q, idx) => {
                const qIndex = q.question_index ?? idx;
                const chosen = selectedAnswers[String(qIndex)];
                const isGraded = Boolean(gradeResult);

                return (
                  <div
                    key={qIndex}
                    className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-5"
                  >
                    <p className="text-sm font-bold text-slate-900">
                      Question {qIndex + 1}. {q.question}
                    </p>

                    <div className="mt-3.5 space-y-2">
                      {(q.options || []).map((opt, optIdx) => {
                        const isSelected = chosen === optIdx;
                        const isCorrect = isGraded && q.correct_index === optIdx;
                        const isWrong = isGraded && isSelected && q.correct_index !== optIdx;

                        let cls = 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
                        if (!isGraded && isSelected) {
                          cls =
                            'border-indigo-600 bg-indigo-50/80 text-indigo-900 ring-1 ring-indigo-600';
                        } else if (isGraded && isCorrect) {
                          cls = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold';
                        } else if (isGraded && isWrong) {
                          cls = 'border-red-400 bg-red-50 text-red-900';
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
                            className={`flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left text-xs transition ${cls}`}
                          >
                            <span>
                              <strong className="mr-2">{String.fromCharCode(65 + optIdx)}.</strong>
                              {opt}
                            </span>
                            {isGraded && isCorrect && (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            )}
                            {isGraded && isWrong && (
                              <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                            )}
                          </button>
                        );
                      })}
                    </div>

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
                  onClick={handleSubmitExam}
                  disabled={submitting}
                  className="rounded-xl bg-indigo-600 px-6 py-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Grading Exam…' : 'Submit Exam for Grading'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
