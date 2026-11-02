import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Download,
  Loader2,
  RotateCcw,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import SourceDocumentSelector from '../components/study-tools/SourceDocumentSelector';
import { useSession } from '../hooks/useSession';
import {
  downloadMaterialPdf,
  fetchFlashcardDecks,
  formatApiError,
  generateFlashcards,
  pollJobUntilDone,
} from '../services/api';
import {
  ensureExactFlashcardCount,
  hydrateExpandedFlashcardList,
} from '../utils/studySetExpander';

const SAMPLE_DECK = {
  id: 'demo',
  title: 'Sample Flashcard Deck (Upload a PDF to generate your own)',
  cards: [
    {
      question: 'How do Studexa flashcards stay grounded in your material?',
      answer:
        'Every card is generated strictly from your uploaded PDF or DOCX chunks and linked to your anonymous browser session.',
    },
    {
      question: 'What happens when you flip or shuffle a flashcard deck?',
      answer:
        'You can reveal the answer on click, navigate Previous/Next, shuffle card order for active recall, or restart the deck at any time.',
    },
  ],
};

export default function Flashcards() {
  const { activeDocumentId, refreshSession } = useSession();
  const [cardCount, setCardCount] = useState(20);
  const [decks, setDecks] = useState([]);
  const [activeDeck, setActiveDeck] = useState(SAMPLE_DECK);
  const [cards, setCards] = useState(SAMPLE_DECK.cards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [jobState, setJobState] = useState(null);
  const [error, setError] = useState(null);

  const selectDeck = useCallback((deck) => {
    setActiveDeck(deck);
    setCards(deck.cards || []);
    setCurrentIndex(0);
    setFlipped(false);
  }, []);

  const loadDecks = useCallback(async () => {
    try {
      const rawList = await fetchFlashcardDecks();
      const list = hydrateExpandedFlashcardList(rawList);
      setDecks(list);
      if (list.length > 0) {
        selectDeck(list[0]);
      }
    } catch {
      // Ignore load errors
    }
  }, [selectDeck]);

  useEffect(() => {
    loadDecks();
  }, [loadDecks]);

  const handleGenerate = async () => {
    if (!activeDocumentId || jobState) return;
    setError(null);
    setJobState({ status: 'queued', queue_position: 1 });

    try {
      const job = await generateFlashcards({
        document_id: activeDocumentId,
        card_count: cardCount,
      });
      setJobState(job);
      const completedJob = await pollJobUntilDone(job.id, (u) => setJobState(u));
      const res = completedJob?.result;
      if (res && Array.isArray(res.cards) && res.cards.length > 0) {
        const baseDeck = {
          id: res.material_id || res.id,
          document_id: res.document_id || activeDocumentId,
          title: res.title || `Flashcards (${cardCount} cards)`,
          cards: res.cards,
          created_at: res.created_at || new Date().toISOString(),
        };
        const expandedDeck = await ensureExactFlashcardCount(
          baseDeck,
          cardCount,
          activeDocumentId
        );
        selectDeck(expandedDeck);
        setDecks((prev) => [
          expandedDeck,
          ...prev.filter((d) => d.id !== expandedDeck.id),
        ]);
      }

      const rawUpdated = await fetchFlashcardDecks();
      if (rawUpdated.length > 0) {
        const targetRaw =
          (res?.material_id && rawUpdated.find((d) => d.id === res.material_id)) ||
          rawUpdated[0];
        if (targetRaw && targetRaw.cards?.length < cardCount) {
          await ensureExactFlashcardCount(
            targetRaw,
            cardCount,
            activeDocumentId
          );
        }
        const updated = hydrateExpandedFlashcardList(rawUpdated);
        setDecks(updated);
        const matched =
          (res?.material_id && updated.find((d) => d.id === res.material_id)) ||
          updated[0];
        selectDeck(matched);
      }
      await refreshSession();
    } catch (err) {
      setError(formatApiError(err, 'Failed to generate flashcards.'));
    } finally {
      setJobState(null);
    }
  };

  const currentCard = cards[currentIndex] || { question: '', answer: '' };

  const handleNext = () => {
    setFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % cards.length);
  };

  const handlePrev = () => {
    setFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
  };

  const handleShuffle = () => {
    setFlipped(false);
    setCards((prev) => [...prev].sort(() => Math.random() - 0.5));
    setCurrentIndex(0);
  };

  const handleRestart = () => {
    setFlipped(false);
    setCards(activeDeck.cards || []);
    setCurrentIndex(0);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Deck Controls */}
      <div className="space-y-6 lg:col-span-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs">
          <h2 className="font-display text-base font-bold text-slate-900">Flashcard Deck Setup</h2>
          <p className="mt-1 text-xs text-slate-500">
            Generate Q&amp;A review decks from your uploaded study documents.
          </p>

          <div className="mt-5">
            <SourceDocumentSelector />
          </div>

          <div className="mt-5">
            <label className="block text-xs font-semibold text-slate-700">Deck Size</label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[20, 50, 70, 100].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setCardCount(cnt)}
                  className={`rounded-xl border py-2 text-xs font-semibold transition ${
                    cardCount === cnt
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {cnt} Cards
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
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {jobState ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {jobState.status === 'queued'
                    ? `Queued (#${jobState.queue_position || 1})…`
                    : 'Generating Cards…'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Generate {cardCount} Flashcards</span>
              </>
            )}
          </button>
        </div>

        {decks.length > 0 && (
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Saved Decks ({decks.length})
            </h3>
            <div className="mt-3 space-y-2">
              {decks.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => selectDeck(d)}
                  className={`flex w-full flex-col items-start rounded-xl border p-3 text-left transition ${
                    activeDeck?.id === d.id
                      ? 'border-indigo-600 bg-indigo-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="line-clamp-1 text-xs font-bold text-slate-900">
                    {d.title}
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    {d.cards.length} cards
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Interactive Flip Card Viewer */}
      <div className="lg:col-span-8">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div>
              <p className="font-bold text-slate-900">{activeDeck.title}</p>
              <span>
                Card {currentIndex + 1} of {cards.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleShuffle}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
              >
                <Shuffle className="h-3.5 w-3.5" />
                <span>Shuffle</span>
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Restart</span>
              </button>
              {activeDeck.id !== 'demo' && (
                <button
                  type="button"
                  onClick={() => downloadMaterialPdf(activeDeck.id, activeDeck.title)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>PDF</span>
                </button>
              )}
            </div>
          </div>

          {/* Interactive Card */}
          <div
            onClick={() => setFlipped(!flipped)}
            className={`mt-5 flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-2xl border p-8 text-center transition-all select-none ${
              flipped
                ? 'border-emerald-200 bg-emerald-50/50'
                : 'border-indigo-100 bg-gradient-to-br from-slate-50 to-indigo-50/40 hover:border-indigo-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-0.5 text-[11px] font-bold uppercase ${
                  flipped
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                {flipped ? 'Answer' : 'Question'}
              </span>
              {currentCard.chunk_ref && (
                <span className="rounded-md bg-white/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
                  Chunk #{currentCard.chunk_ref}
                </span>
              )}
            </div>
            <p className="mt-4 max-w-xl font-display text-lg font-bold text-slate-900 sm:text-xl">
              {flipped ? currentCard.answer : currentCard.question}
            </p>
            <span className="mt-6 text-xs font-medium text-slate-400">
              Click card to {flipped ? 'show question' : 'reveal answer'}
            </span>
          </div>

          {/* Navigation Controls */}
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrev}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              onClick={() => setFlipped(!flipped)}
              className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {flipped ? 'Show Question' : 'Flip Card'}
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <span>Next</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
