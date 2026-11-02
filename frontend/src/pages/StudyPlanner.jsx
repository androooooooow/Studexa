import React from 'react';
import PhaseNoticeCard from '../components/common/PhaseNoticeCard';

export default function StudyPlanner() {
  return (
    <PhaseNoticeCard
      title="Study Planner"
      phaseNumber={5}
      description="Create and manage study tasks and exam deadlines persisted in your anonymous session."
      features={[
        'Create tasks with descriptions and due dates',
        'Toggle task completion with deterministic backend logic',
        'Filter upcoming and completed tasks',
      ]}
    />
  );
}
