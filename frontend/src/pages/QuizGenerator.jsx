import React from 'react';
import PhaseNoticeCard from '../components/common/PhaseNoticeCard';

export default function QuizGenerator() {
  return (
    <PhaseNoticeCard
      title="AI Quiz Generator"
      phaseNumber={4}
      description="Generate multiple-choice practice quizzes from selected study materials with configurable question counts and difficulty."
      features={[
        'Configurable question count and difficulty level',
        'Hidden answer keys until submission',
        'Deterministic grading and source-grounded explanations',
      ]}
    />
  );
}
