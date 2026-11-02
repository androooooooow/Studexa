import React from 'react';
import PhaseNoticeCard from '../components/common/PhaseNoticeCard';

export default function StudyLibrary() {
  return (
    <PhaseNoticeCard
      title="Personal Study Library"
      phaseNumber={5}
      description="Manage all uploaded documents and generated study materials for your current anonymous session."
      features={[
        'Browse and open summaries, quizzes, flashcards, and uploaded documents',
        'Export generated materials to PDF via ReportLab',
        'Delete owned materials with strict session ownership verification',
      ]}
    />
  );
}
