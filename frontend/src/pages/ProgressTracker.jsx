import React from 'react';
import PhaseNoticeCard from '../components/common/PhaseNoticeCard';

export default function ProgressTracker() {
  return (
    <PhaseNoticeCard
      title="Learning Progress Tracker"
      phaseNumber={5}
      description="Track your quiz and exam scores, completed study tasks, and recent study activity."
      features={[
        'Deterministic score and completion statistics calculated in Python',
        'Recent study activity timeline',
        'Visual breakdown of exam and quiz performance',
      ]}
    />
  );
}
