import React, { useState, useEffect } from 'react';
import { X, Zap, Users, User, ChevronRight, Loader, CheckCircle, AlertCircle, Search } from 'lucide-react';
import { getLeads, startBatchGenerate, getBatchProgress } from '../api';

const SEGMENT_COLORS = { hot: '#fdab3d', warm: '#2563eb', cold: '#8e8ea0' };

export default function GenerateModal({ onClose, onComplete }) {
  const [mode, setMode]               = useState('all');         // 'all' | 'segment' | 'individual'
  const [segment, setSegment]         = useState('hot');
  const [leads, setLeads]             = useState([]);
  const [leadSearch, setLeadSearch]   = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [jobId, setJobId]             = useState(null);
  const [progress, setProgress]       = useState(null);
  const [error, setError]             = useState('');

  // Load leads for individual mode
  useEffect(() => {
    if (mode === 'individual' && leads.length === 0) {
      setLoadingLeads(true);
      getLeads()
        .then(ls => setLeads(ls.filter(l => !l.archived && l.email)))
        .catch(e => setError(e.message))
        .finally(() => setLoadingLeads(false));
    }
  }, [mode]);

  // Poll batch progress
  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const p = await getBatchProgress(jobId);
        setProgress(p);
        if (p.done) {
          clearInterval(interval);
          setTimeout(() => { onComplete?.(); onClose(); }, 1800);
        }
      } catch (e) { clearInterval(interval); }
    }, 800);
    return () => clearInterval(interval);
  }, [jobId]);

  const filteredLeads = leads.filter(l =>
    !leadSearch ||
    (l.name || '').toLowerCase().includes(leadSearch.toLowerCase()) ||
    (l.email || '').toLowerCase().includes(leadSearch.toLowerCase())
  );

  const toggleLead = (id) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleGenerate = async () => {
    setError('');
    setGenerating(true);
    try {
      const { jobId: id, total } = await startBatchGenerate(
        mode,
        mode === 'segment' ? segment : undefined,
        mode === 'individual' ? [...selectedIds] : undefined
      );
      setJobId(id);
      setProgress({ total, completed: 0, errors: 0, percent: 0, done: false });
    } catch (e) {
      setError(e.message);
      setGenerating(false);
    }
  };

  const canGenerate = !generating && (
    mode === 'all' ||
    (mode === 'segment') ||
    (mode === 'individual' && selectedIds.size > 0)
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12, width: 540, maxHeight: '85vh',
        border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Generate Emails</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>AI-powered personalized outreach using Claude</div>
          </div>
          <button onClick={onClose} disabled={generating && !progress?.done} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {!generating ? (
            <>
              {/* Mode cards */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Generation Mode
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {[
                  { id: 'all',        icon: Users,  label: 'All Leads',      desc: 'Generate emails for every lead with an email address' },
                  { id: 'segment',    icon: Zap,    label: 'By Segment',     desc: 'Only generate for Hot, Warm, or Cold leads' },
                  { id: 'individual', icon: User,   label: 'Individual',     desc: 'Pick specific leads to generate for' },
                ].map(({ id, icon: Icon, label, desc }) => (
                  <div
                    key={id}
                    onClick={() => setMode(id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                      borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s',
                      background: mode === id ? 'rgba(37,99,235,0.1)' : 'var(--surface-2)',
                      border: `1px solid ${mode === id ? 'var(--orange)' : 'var(--border)'}`,
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: mode === id ? '#2563eb20' : '#ffffff', flexShrink: 0,
                    }}>
                      <Icon size={17} color={mode === id ? '#2563eb' : '#8e8ea0'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: mode === id ? '#fff' : '#8e8ea0' }}>{label}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{desc}</div>
                    </div>
                    {mode === id && <ChevronRight size={14} color="#2563eb" />}
                  </div>
                ))}
              </div>

              {/* Segment picker */}
              {mode === 'segment' && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Select segment to generate for:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['hot', 'warm', 'cold'].map(s => (
                      <button
                        key={s}
                        onClick={() => setSegment(s)}
                        style={{
                          padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          border: `1px solid ${segment === s ? SEGMENT_COLORS[s] : 'var(--border)'}`,
                          background: segment === s ? `${SEGMENT_COLORS[s]}20` : 'var(--surface-2)',
                          color: segment === s ? SEGMENT_COLORS[s] : '#8e8ea0',
                          textTransform: 'capitalize',
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Individual lead picker */}
              {mode === 'individual' && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                    <input
                      style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 6, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box' }}
                      placeholder="Search leads by name or email…"
                      value={leadSearch}
                      onChange={e => setLeadSearch(e.target.value)}
                    />
                  </div>
                  {loadingLeads ? (
                    <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>Loading leads…</div>
                  ) : (
                    <div style={{ maxHeight: 220, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
                      {filteredLeads.length === 0 ? (
                        <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>No leads with email addresses found</div>
                      ) : filteredLeads.map(l => (
                        <div
                          key={l.id}
                          onClick={() => toggleLead(l.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                            cursor: 'pointer', borderBottom: '1px solid var(--border)',
                            background: selectedIds.has(l.id) ? '#e8ecf4' : 'transparent',
                          }}
                        >
                          <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleLead(l.id)} onClick={e => e.stopPropagation()} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{l.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.email}</div>
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                            background: `${SEGMENT_COLORS[l.lead_segment || 'cold']}20`,
                            color: SEGMENT_COLORS[l.lead_segment || 'cold'],
                            textTransform: 'uppercase',
                          }}>
                            {l.lead_segment || 'cold'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedIds.size > 0 && (
                    <div style={{ fontSize: 12, color: '#2563eb', marginTop: 8 }}>{selectedIds.size} lead{selectedIds.size !== 1 ? 's' : ''} selected</div>
                  )}
                </div>
              )}

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ff5c5c20', border: '1px solid #ff5c5c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ff5c5c', fontSize: 13 }}>
                  <AlertCircle size={14} /> {error}
                </div>
              )}
            </>
          ) : (
            /* Progress UI */
            <div style={{ padding: '8px 0' }}>
              {progress && !progress.done ? (
                <>
                  <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16, textAlign: 'center' }}>
                    Generating emails… please keep this window open
                  </div>
                  <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, marginBottom: 12, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${progress.percent || 0}%`,
                      background: 'var(--orange)',
                      borderRadius: 4, transition: 'width 0.4s',
                    }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>
                      <span style={{ color: 'var(--text)', fontWeight: 700 }}>{progress.completed}</span> / {progress.total} emails generated
                    </span>
                    {progress.errors > 0 && (
                      <span style={{ color: '#fdab3d', fontSize: 12 }}>{progress.errors} error{progress.errors !== 1 ? 's' : ''}</span>
                    )}
                    <span style={{ color: '#2563eb', fontWeight: 600 }}>{progress.percent}%</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>
                    Emails are processed in batches of 10 to avoid rate limits.
                    <br />Estimated time: ~{Math.ceil((progress.total - progress.completed) / 10 * 1.2)} min remaining.
                  </div>
                </>
              ) : progress?.done ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <CheckCircle size={40} color="#2563eb" style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Done!</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {progress.completed - progress.errors} emails generated
                    {progress.errors > 0 && ` (${progress.errors} failed)`}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Closing and refreshing queue…</div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted)', padding: 20 }}>
                  <Loader size={18} style={{ animation: 'spin 0.7s linear infinite' }} /> Starting generation job…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!generating && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn-ghost" onClick={onClose} style={{ padding: '8px 18px' }}>Cancel</button>
            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={!canGenerate}
              style={{ padding: '8px 20px', gap: 8, opacity: canGenerate ? 1 : 0.5 }}
            >
              <Zap size={14} />
              {mode === 'all' ? 'Generate All' :
               mode === 'segment' ? `Generate ${segment.charAt(0).toUpperCase() + segment.slice(1)} Leads` :
               `Generate ${selectedIds.size} Email${selectedIds.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
