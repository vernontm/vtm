import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CalendarClock } from 'lucide-react';
import { toast } from '../Toast';
import { Tile, TileHead, Big, Sub } from './shared';

// Book next: the assistant finds the next slot that works, with drive times
// from the office and what is already booked. The chips copy their question
// and open the Assistant, so the answer is one paste away. The assistant page
// does not read a question off the URL yet, so the copy is what carries it.
const OFFICE = '23018 Undertaken Path, Katy';
const PROMPTS = [
  { label: 'In person this week', text: `Find the best in-person slots this week from ${OFFICE}, and pair them with what is already booked` },
  { label: 'Call this week', text: 'Find the best times for a call this week, and pair them with what is already booked' },
];

export default function BookNextTile({ to = '/assistant', full = true }) {
  const navigate = useNavigate();
  const ask = async (p) => {
    try {
      await navigator.clipboard.writeText(p.text);
      toast('success', 'Question copied. Paste it to the assistant.');
    } catch (_) { /* clipboard blocked, the assistant still opens */ }
    navigate(to);
  };
  return (
    <Tile full={full}>
      <TileHead label="Book next" to={to} linkLabel="Assistant" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Sparkles size={17} color="var(--orange)" />
        </span>
        <div style={{ minWidth: 0 }}>
          <Big size={20}>Find the next slot</Big>
          <Sub>Drive times from the office, paired with what is booked</Sub>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PROMPTS.map(p => (
          <button key={p.label} type="button" className="home-pill" onClick={() => ask(p)}>
            <CalendarClock size={12} /> {p.label}
          </button>
        ))}
      </div>
    </Tile>
  );
}
