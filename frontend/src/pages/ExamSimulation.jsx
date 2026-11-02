import React from 'react';
import PhaseNoticeCard from '../components/common/PhaseNoticeCard';

export default function ExamSimulation() {
  return (
    <PhaseNoticeCard
      title="Exam Simulation"
      phaseNumber={4}
      description="Simulate an exam from your uploaded materials with deterministic backend grading and persisted attempt history."
      features={[
        'Configurable question count and difficulty',
        'Exact score and percentage calculated deterministically in Python',
        'Full post-submission review with explanations and saved attempt history',
      ]}
    />
  );
}
