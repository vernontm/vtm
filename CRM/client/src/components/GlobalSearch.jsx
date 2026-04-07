import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Users, Briefcase, Star, Building2, FolderOpen, Loader, ArrowRight } from 'lucide-react';
import { searchAll } from '../api';

const CATEGORIES = [
  { key: 'leads',    label: 'Leads',    icon: Star,      color: '#f5a623', route: '/leads'    },
  { key: 'contacts', label: 'Contacts', icon: Users,     color: '#4a6cf7', route: '/contacts' },
  { key: 'deals',    label: 'Deals',    icon: Briefcase, color: '#22c55e', route: '/deals'    },
  { key: 'accounts', label: 'Accounts', icon: Building2, color: '#784bd1', route: '/accounts' },
  { key: 'projects', label: 'Projects', icon: FolderOpen, color: '#00b8d4', route: '/projects' },
];

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'hot')        return '#ff5c5c';
  if (s === 'warm')       return '#f5a623';
  if (s === 'cold')       return '#8e8ea0';
  if (s === 'won')        return '#22c55e';
  if (s === 'lost')       return '#ff5c5c';
  if (s === 'active')     return '#22c55e';
  if (s === 'completed')  return '#4a6cf7';
  return '#8e8ea0';
}

function ResultRow({ result, isActive, onHover, onClick }) {
  const cat = CATEGORIES.find(c => c.key === result._cat);
  const Icon = cat?.icon || Star;
  const color = cat?.color || '#4a6cf7';
  const sub = result.email || result.client || result.industry || result.company || '';
  const badge = result.status || result.stage || '';

  return (
    <div
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px', cursor: 'pointer', borderRadius: 7, margin: '2px 6px',
        background: isActive ? '#f0f2f8' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 8, background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={14} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {result.name}
        </div>
        {sub && <div style={{ fontSize: 11, color: '#8e8ea0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      {badge && (
        <div style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, flexShrink: 0,
          background: statusColor(badge) + '18', color: statusColor(badge),
          border: `1px solid ${statusColor(badge)}30`,
        }}>
          {badge}
        </div>
      )}
      {result.value > 0 && (
        <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, flexShrink: 0 }}>
          ${result.value.toLocaleString()}
        </div>
      )}
      <ArrowRight size={13} color="#e5e7ef" style={{ flexShrink: 0 }} />
    </div>
  );
}

export default function GlobalSearch({ onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const flatResults = results
    ? CATEGORIES.flatMap(cat => (results[cat.key] || []).map(r => ({ ...r, _cat: cat.key, _route: cat.route })))
    : [];

  const doSearch = useCallback((q) => {
    if (!q.trim()) { setResults(null); setLoading(false); return; }
    setLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchAll(q);
        setResults(data);
        setActiveIdx(0);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }, 250);
  }, []);

  function handleChange(e) { const q = e.target.value; setQuery(q); doSearch(q); }

  function goTo(result) {
    const cat = CATEGORIES.find(c => c.key === result._cat);
    if (!cat) return;
    navigate(`${cat.route}?search=${encodeURIComponent(result.name)}`);
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (flatResults.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flatResults.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flatResults[activeIdx]) goTo(flatResults[activeIdx]); }
  }

  const total = results ? (results.total || 0) : 0;
  const hasResults = results && total > 0;
  const noResults = results && total === 0 && query.trim();
  let flatIdx = 0;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)', zIndex: 9500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 14,
        width: 560, maxWidth: '92vw', boxShadow: '0 24px 80px rgba(0,0,0,0.1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: '70vh',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #e5e7ef', flexShrink: 0 }}>
          {loading
            ? <Loader size={16} color="#8e8ea0" style={{ flexShrink: 0, animation: 'spin 0.7s linear infinite' }} />
            : <Search size={16} color="#8e8ea0" style={{ flexShrink: 0 }} />
          }
          <input
            ref={inputRef} value={query} onChange={handleChange} onKeyDown={handleKeyDown}
            placeholder="Search leads, contacts, deals, projects..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 15, color: '#1a1a2e', caretColor: '#4a6cf7' }}
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b0b0c0', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <X size={15} />
            </button>
          )}
          <div style={{ fontSize: 11, color: '#8e8ea0', background: '#f0f2f8', border: '1px solid #e5e7ef', borderRadius: 5, padding: '2px 6px', flexShrink: 0 }}>ESC</div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!query && !results && (
            <div style={{ padding: '28px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                return (
                  <div key={cat.key} onClick={() => { navigate(cat.route); onClose(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
                      background: cat.color + '10', border: `1px solid ${cat.color}25`, fontSize: 12, color: cat.color, fontWeight: 600,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = cat.color + '20'}
                    onMouseLeave={e => e.currentTarget.style.background = cat.color + '10'}
                  >
                    <Icon size={13} /> {cat.label}
                  </div>
                );
              })}
            </div>
          )}

          {noResults && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#8e8ea0' }}>
              <Search size={32} style={{ opacity: 0.2, marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>No results for "{query}"</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Try a name, email, company, or deal name</div>
            </div>
          )}

          {hasResults && CATEGORIES.map(cat => {
            const items = (results[cat.key] || []);
            if (items.length === 0) return null;
            const Icon = cat.icon;
            return (
              <div key={cat.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px 4px', fontSize: 10, fontWeight: 700, color: cat.color, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                  <Icon size={10} /> {cat.label}
                </div>
                {items.map(result => {
                  const currentIdx = flatIdx++;
                  const withCat = { ...result, _cat: cat.key, _route: cat.route };
                  return <ResultRow key={result.id} result={withCat} isActive={activeIdx === currentIdx} onHover={() => setActiveIdx(currentIdx)} onClick={() => goTo(withCat)} />;
                })}
              </div>
            );
          })}

          {hasResults && (
            <div style={{ padding: '8px 14px 12px', borderTop: '1px solid #f0f2f8', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {CATEGORIES.filter(cat => (results[cat.key] || []).length > 0).map(cat => (
                <button key={cat.key} onClick={() => { navigate(`${cat.route}?search=${encodeURIComponent(query)}`); onClose(); }}
                  style={{ background: 'none', border: '1px solid #e5e7ef', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#8e8ea0', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#4a6cf7'; e.currentTarget.style.borderColor = '#4a6cf7'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#8e8ea0'; e.currentTarget.style.borderColor = '#e5e7ef'; }}
                >
                  All {cat.label} →
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '7px 16px', borderTop: '1px solid #f0f2f8', display: 'flex', gap: 14, flexShrink: 0 }}>
          {[['↑↓', 'Navigate'], ['↵', 'Go to page'], ['ESC', 'Close']].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8e8ea0' }}>
              <span style={{ background: '#f0f2f8', border: '1px solid #e5e7ef', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace', fontSize: 10 }}>{key}</span>
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
