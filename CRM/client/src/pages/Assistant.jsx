import React from 'react';
import { Sparkles } from 'lucide-react';
import AssistantChat from '../components/AssistantChat';

// The CRM assistant: ask about availability, leads to follow up, people, and
// the calendar. Read-only for now; it uses live CRM data through server tools.
const STARTERS = [
  'Check availability next week for a 1 hour in-person meetup',
  'Which leads need to be followed up with?',
  "What's on my calendar in the next day?",
  'Find open times tomorrow for a 30 minute call',
];

export default function Assistant() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: 'var(--font-display)' }}>
      <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={18} style={{ color: 'var(--orange)' }} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>Assistant</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Ask about availability, follow-ups, people, and your calendar.</div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <AssistantChat starters={STARTERS} />
      </div>
    </div>
  );
}
