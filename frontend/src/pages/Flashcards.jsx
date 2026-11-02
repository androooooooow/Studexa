import React from 'react';
import PhaseNoticeCard from '../components/common/PhaseNoticeCard';

export default function Flashcards() {
  return (
    <PhaseNoticeCard
      title="Flashcard Generator"
      phaseNumber={4}
      description="Generate question-and-answer flashcards from your documents with flip, shuffle, and navigation controls."
      features={[
        'Interactive card flip to reveal answers',
        'Previous/Next navigation, shuffle, and deck restart',
        'Saved to your anonymous session and linked to the source document',
      ]}
    />
  );
}
