import React, { useState, useEffect, useMemo } from 'react';
import { Users, Check } from 'lucide-react';
import Modal from './Modal';
import { toast } from './Toast';
import { getChatPeople, createChat } from '../api';

// Start an internal chat: pick one teammate for a direct message, or several
// plus a name for a group. Only people signed into the app can be picked,
// because they are the ones who get the message.
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

export default function NewChatModal({ me, onClose, onCreated }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState([]);
  const [name, setName] = useState('');

  useEffect(() => {
    let live = true;
    getChatPeople()
      .then(r => { if (live) setPeople(r?.people || []); })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const mine = (me?.id || '').toString();
  const others = useMemo(() => people.filter(p => p.id !== mine && p.on_app), [people, mine]);
  const notOnApp = useMemo(() => people.filter(p => p.id !== mine && !p.on_app), [people, mine]);
  const isGroup = pick.length > 1;
  const toggle = (id) => setPick(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const start = async () => {
    if (!pick.length) return;
    try {
      const r = await createChat({ kind: isGroup ? 'group' : 'dm', name: name.trim(), member_ids: pick });
      onCreated(r?.room || null);
    } catch (e) {
      toast('error', (e.needs_migration || e.status === 503) ? 'Team chat is not set up yet.' : e.message);
    }
  };

  return (
    <Modal title="New team chat" onClose={onClose} onSubmit={start}
      submitLabel={isGroup ? 'Start group chat' : 'Start chat'} disabled={!pick.length}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          Teammates only. Pick one person for a direct message, or several for a group.
          To reach a customer, open their conversation under Clients.
        </div>

        <div>
          <span style={LABEL}>Team</span>
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading the team…</div>
          ) : others.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              No teammates on the app yet. Once they sign in on their phone they show up here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {others.map(p => {
                const on = pick.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
                      fontSize: 12.5, fontWeight: 700,
                      border: `1.5px solid ${on ? 'var(--orange)' : 'var(--border)'}`,
                      background: on ? 'rgba(37,99,235,0.10)' : 'var(--surface)',
                      color: on ? 'var(--orange)' : 'var(--text)',
                    }}>
                    {on && <Check size={13} />} {p.name}
                  </button>
                );
              })}
            </div>
          )}
          {notOnApp.length > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
              Not on the app yet: {notOnApp.map(p => firstName(p.name)).join(', ')}. They can join once they sign in on their phone.
            </div>
          )}
        </div>

        {isGroup && (
          <div>
            <span style={LABEL}>Group name</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="VTM team, Content crew"
              style={INPUT} />
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Users size={12} /> {pick.length + 1} people, you included.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

const INPUT = {
  width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13.5,
  fontFamily: 'var(--font-display)', boxSizing: 'border-box',
};
const LABEL = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' };
