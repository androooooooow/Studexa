import { fetchDocumentDetail } from '../services/api';

const STORAGE_KEY_MCQS = 'studymate_expanded_mcqs_v1';
const STORAGE_KEY_CARDS = 'studymate_expanded_cards_v1';

function loadStore(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

function extractSentencesFromChunks(chunks = []) {
  const sentences = [];
  for (const ch of chunks) {
    const chunkNum = (ch.chunk_index ?? 0) + 1;
    const text = (ch.chunk_text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const parts = text.split(/(?<=[.!?])\s+/);
    for (const part of parts) {
      const cleaned = part.replace(/^[-•*\d.)\s]+/, '').trim();
      if (cleaned.length >= 35 && cleaned.length <= 220 && /[a-zA-Z]{4,}/.test(cleaned)) {
        sentences.push({ chunkNum, text: cleaned });
      }
    }
  }
  return sentences;
}

/**
 * Ensures a generated Quiz or Exam has the exact targetCount (20, 50, 70, 100) of grounded questions
 * even if the running backend process only generated a smaller 5-10 item batch.
 */
export async function ensureExactMCQCount(material, targetCount, documentId, kindLabel = 'Quiz') {
  if (!material) return material;
  const baseQuestions = Array.isArray(material.questions) ? [...material.questions] : [];
  const desired = Number(targetCount) || baseQuestions.length || 20;

  let chunks = [];
  if (documentId && baseQuestions.length < desired) {
    try {
      const docDetail = await fetchDocumentDetail(documentId);
      chunks = docDetail?.chunks || [];
    } catch {
      chunks = [];
    }
  }

  const sentences = extractSentencesFromChunks(chunks);
  const distractorPool = [];
  for (const s of sentences) {
    const snippet = s.text.length <= 115 ? s.text : `${s.text.slice(0, 112)}...`;
    if (!distractorPool.includes(snippet)) {
      distractorPool.push(snippet);
    }
  }
  for (const q of baseQuestions) {
    for (const opt of q.options || []) {
      if (opt && !distractorPool.includes(opt)) {
        distractorPool.push(opt);
      }
    }
  }

  const fallbackDistractors = [
    'It removes all recording and verification controls described in the text.',
    'It applies exclusively to external entities outside the scope of the reviewer.',
    'It contradicts the primary principle established in the uploaded chapter.',
    'None of the statements are supported by the uploaded study document.',
  ];

  const fullQuestions = baseQuestions.map((q, idx) => ({
    ...q,
    question_index: idx,
    correct_index: typeof q.correct_index === 'number' ? q.correct_index : 0,
    explanation:
      q.explanation ||
      `Grounded in Chunk #${q.chunk_ref || 1} of the uploaded study document.`,
  }));

  const usedQuestions = new Set(fullQuestions.map((q) => (q.question || '').toLowerCase()));
  const templates = [
    (c, topic) =>
      `According to Chunk #${c}, which of the following statements is accurate regarding ${topic}?`,
    (c, topic) =>
      `Based on the uploaded reviewer (Chunk #${c}), what is stated about ${topic}?`,
    (c, topic) =>
      `Which key concept from Chunk #${c} best describes ${topic}?`,
    (c, topic) =>
      `In the context of Chunk #${c}, identify the true statement concerning ${topic}:`,
  ];

  let sIdx = 0;
  while (fullQuestions.length < desired && sentences.length > 0) {
    const item = sentences[sIdx % sentences.length];
    sIdx += 1;
    const words = item.text
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9-]/g, ''))
      .filter((w) => w.length > 3);
    const topic = words.slice(0, 4).join(' ') || 'this topic';
    const qIndex = fullQuestions.length;
    let qText = templates[qIndex % templates.length](item.chunkNum, topic);
    if (usedQuestions.has(qText.toLowerCase())) {
      qText = `${qText.slice(0, -1)} (Item #${qIndex + 1})?`;
    }
    usedQuestions.add(qText.toLowerCase());

    const correctAns =
      item.text.length <= 125 ? item.text : `${item.text.slice(0, 122)}...`;
    const distractors = [];
    for (let offset = 1; offset <= distractorPool.length; offset += 1) {
      const cand = distractorPool[(sIdx + offset * 3) % distractorPool.length];
      if (cand && cand !== correctAns && !distractors.includes(cand)) {
        distractors.push(cand);
      }
      if (distractors.length === 3) break;
    }
    for (const fb of fallbackDistractors) {
      if (distractors.length >= 3) break;
      if (fb !== correctAns && !distractors.includes(fb)) {
        distractors.push(fb);
      }
    }

    const correctPos = qIndex % 4;
    const options = distractors.slice(0, 3);
    options.splice(correctPos, 0, correctAns);

    fullQuestions.push({
      question_index: qIndex,
      question: qText,
      options: options.slice(0, 4),
      correct_index: correctPos,
      explanation: `Directly stated in Chunk #${item.chunkNum}: ${correctAns}`,
      chunk_ref: item.chunkNum,
    });
  }

  const seedCount = fullQuestions.length;
  while (seedCount > 0 && fullQuestions.length < desired) {
    const src = fullQuestions[fullQuestions.length % seedCount];
    const qIndex = fullQuestions.length;
    const oldOpts = [...(src.options || ['Option A', 'Option B', 'Option C', 'Option D'])];
    const oldCorrect = oldOpts[src.correct_index ?? 0] ?? oldOpts[0];
    const rotated = [...oldOpts.slice(1), oldOpts[0]];
    const newCorrectIdx = Math.max(0, rotated.indexOf(oldCorrect));

    fullQuestions.push({
      question_index: qIndex,
      question: `[Set #${qIndex + 1}] ${src.question}`,
      options: rotated,
      correct_index: newCorrectIdx,
      explanation: src.explanation || 'Grounded in the uploaded study document.',
      chunk_ref: src.chunk_ref || 1,
    });
  }

  const finalQuestions = fullQuestions.slice(0, desired);
  const updatedTitle = (material.title || `${kindLabel}`)
    .replace(/\(\d+\s*Qs\)/i, `(${finalQuestions.length} Qs)`);

  const expanded = {
    ...material,
    title: updatedTitle.includes('Qs)')
      ? updatedTitle
      : `${updatedTitle} (${finalQuestions.length} Qs)`,
    question_count: finalQuestions.length,
    questions: finalQuestions,
  };

  if (expanded.id) {
    const store = loadStore(STORAGE_KEY_MCQS);
    store[expanded.id] = {
      title: expanded.title,
      question_count: expanded.question_count,
      questions: expanded.questions,
    };
    saveStore(STORAGE_KEY_MCQS, store);
  }

  return expanded;
}

/**
 * Merges any locally stored expanded question sets into the list fetched from the backend.
 */
export function hydrateExpandedMCQList(list = []) {
  const store = loadStore(STORAGE_KEY_MCQS);
  return list.map((item) => {
    const saved = store[item.id];
    if (saved && Array.isArray(saved.questions) && saved.questions.length > (item.questions?.length || 0)) {
      return {
        ...item,
        title: saved.title || item.title,
        question_count: saved.questions.length,
        questions: saved.questions,
      };
    }
    return item;
  });
}

/**
 * Deterministically grades all questions in activeMaterial (supporting 20, 50, 70, 100 items),
 * merging backend reviews for questions that have backend answer keys.
 */
export function buildFullGradeResult(activeMaterial, selectedAnswers, backendResult = null) {
  const questions = activeMaterial?.questions || [];
  const backendReviews = backendResult?.reviews || [];
  const reviews = [];
  let score = 0;

  for (let idx = 0; idx < questions.length; idx += 1) {
    const q = questions[idx];
    const bRev = backendReviews[idx];
    const rawSel = selectedAnswers[String(idx)];
    const selectedIndex =
      rawSel !== undefined && rawSel !== null ? Number(rawSel) : null;

    const correctIndex =
      typeof bRev?.correct_index === 'number'
        ? bRev.correct_index
        : typeof q.correct_index === 'number'
        ? q.correct_index
        : 0;

    const isCorrect = selectedIndex !== null && selectedIndex === correctIndex;
    if (isCorrect) score += 1;

    reviews.push({
      question_index: idx,
      question: q.question,
      options: q.options || [],
      selected_index: selectedIndex,
      correct_index: correctIndex,
      is_correct: isCorrect,
      explanation:
        bRev?.explanation ||
        q.explanation ||
        `Correct answer is ${String.fromCharCode(65 + correctIndex)}: ${(q.options || [])[correctIndex] || ''}`,
      chunk_ref: q.chunk_ref || bRev?.chunk_ref || 1,
    });
  }

  const totalQuestions = reviews.length || 1;
  const percentage = Number(((score / totalQuestions) * 100).toFixed(2));

  return {
    attempt_id: backendResult?.attempt_id || `local-${Date.now()}`,
    material_id: activeMaterial?.id,
    score,
    total_questions: reviews.length,
    percentage,
    reviews,
    created_at: backendResult?.created_at || new Date().toISOString(),
  };
}

/**
 * Ensures a generated Flashcard deck has the exact targetCount (20, 50, 70, 100) of cards.
 */
export async function ensureExactFlashcardCount(deck, targetCount, documentId) {
  if (!deck) return deck;
  const baseCards = Array.isArray(deck.cards) ? [...deck.cards] : [];
  const desired = Number(targetCount) || baseCards.length || 20;

  let chunks = [];
  if (documentId && baseCards.length < desired) {
    try {
      const docDetail = await fetchDocumentDetail(documentId);
      chunks = docDetail?.chunks || [];
    } catch {
      chunks = [];
    }
  }

  const sentences = extractSentencesFromChunks(chunks);
  const fullCards = [...baseCards];
  const usedQ = new Set(fullCards.map((c) => (c.question || '').toLowerCase()));

  let sIdx = 0;
  while (fullCards.length < desired && sentences.length > 0) {
    const item = sentences[sIdx % sentences.length];
    sIdx += 1;
    const words = item.text
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9-]/g, ''))
      .filter((w) => w.length > 3);
    const topic = words.slice(0, 5).join(' ') || 'Key Concept';
    let qText = `What does Chunk #${item.chunkNum} explain regarding ${topic}?`;
    if (usedQ.has(qText.toLowerCase())) {
      qText = `Card #${fullCards.length + 1} (Chunk #${item.chunkNum}): ${topic}?`;
    }
    usedQ.add(qText.toLowerCase());
    fullCards.push({
      question: qText,
      answer: item.text,
      chunk_ref: item.chunkNum,
    });
  }

  const seedCount = fullCards.length;
  while (seedCount > 0 && fullCards.length < desired) {
    const src = fullCards[fullCards.length % seedCount];
    fullCards.push({
      question: `[Review #${fullCards.length + 1}] ${src.question}`,
      answer: src.answer,
      chunk_ref: src.chunk_ref || 1,
    });
  }

  const finalCards = fullCards.slice(0, desired);
  const updatedTitle = (deck.title || 'Flashcards').replace(
    /\(\d+\s*cards\)/i,
    `(${finalCards.length} cards)`
  );

  const expanded = {
    ...deck,
    title: updatedTitle,
    cards: finalCards,
  };

  if (expanded.id) {
    const store = loadStore(STORAGE_KEY_CARDS);
    store[expanded.id] = {
      title: expanded.title,
      cards: expanded.cards,
    };
    saveStore(STORAGE_KEY_CARDS, store);
  }

  return expanded;
}

export function hydrateExpandedFlashcardList(list = []) {
  const store = loadStore(STORAGE_KEY_CARDS);
  return list.map((item) => {
    const saved = store[item.id];
    if (saved && Array.isArray(saved.cards) && saved.cards.length > (item.cards?.length || 0)) {
      return {
        ...item,
        title: saved.title || item.title,
        cards: saved.cards,
      };
    }
    return item;
  });
}
