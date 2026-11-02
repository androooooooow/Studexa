import React from 'react';
import PhaseNoticeCard from '../components/common/PhaseNoticeCard';

export default function Summarizer() {
  return (
    <PhaseNoticeCard
      title="AI Summarizer"
      phaseNumber={4}
      description="Generate structured summaries from your uploaded documents using local Gemma 3 1B via the serialized AI job queue."
      features={[
        'Short, medium, and detailed summary styles',
        'Main ideas, key terms, definitions, and important details',
        'Strictly grounded in uploaded source excerpts',
      ]}
    />
  );
}
