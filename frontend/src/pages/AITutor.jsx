import React from 'react';
import PhaseNoticeCard from '../components/common/PhaseNoticeCard';

export default function AITutor() {
  return (
    <PhaseNoticeCard
      title="AI Tutor & Study Chatbot"
      phaseNumber={4}
      description="Ask questions about your uploaded documents. Uses SQLite FTS5 retrieval to ground answers in your course material."
      features={[
        'Retrieves relevant chunks from your selected document before generating an answer',
        'Clearly labels when general knowledge is used vs. document-supported facts',
        'Conversation history isolated per anonymous session',
      ]}
    />
  );
}
