import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Users, Briefcase, Star, Building2, FolderOpen, Loader, ArrowRight } from 'lucide-react';
import { searchAll } from '../api';

// ── Category config ────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'leads',    label: 'Leads',    icon: Star,      color: '#fdab3d', route: '/leads'    },
  { key: 'contacts', label: 'Contacts', icon: Users,     color: '#ff9b26', route: '/contacts' },
  { key: 'deals',    label: 'Deals',    icon: Briefcase, color: '#ff9b26', route: '/deals'    },
  { key: 'accounts', label: 'Accounts', icon: Building2, color: '#784bd1', route: '/accounts' },
  { key: 'projects', label: 'Projects', icon: FolderOpen, color: '#00d1d1', route: '/projects' },
];

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'hot')        return '#ff5c5c';
  if (s === 'warm')       return '#fdab3d';
  if (s === 'cold')       return '#ff9b26';
  if (s === 'won')        return '#ff9b26';
  if (s === 'lost')       return '#ff5c5c';
  if (s === 'active')     return '#ff9b26';
  if (s === 'completed')  return '#ff9b26';
  return '#4a4845';
}

function ResultRow({ result, isActive, onHover, onClick }) {
  const cat = CATEGORIES.find(c => c.key === result._cat);
  const Icon = cat?.icon || Star;
  const color = cat?.color || '#ff9b26';

  const sub = result.email || result.client || result.industry || result.company || '';
  const badge = result.status || result.stage || '';

  return (
    <div
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px', cursor: 'pointer', borderRadius: 7, margin: '2px 6px',
        background: isActive ? '#111110' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      {/* Category icon bubble */}
      <div style={{
        width: 30, height: 30, borderRadius: 8, background: color + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={14} color={color} />
      </div>

      {/* Name + sub */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e6df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {result.name}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: '#4a4845', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sub}
          </div>
        )}
      </div>

      {/* Badge (status/stage) */}
      {badge && (
        <div style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, flexShrink: 0,
          background: statusColor(badge) + '22', color: statusColor(badge),
          border: `1px solid ${statusColor(badge)}44`,
        }}>
          {badge}
        </div>
      )}

      {/* Value for deals */}
      {result.value > 0 && (
        <div style={{ fontSize: 12, color: '#ff9b26', fontWeight: 700, flexShrink: 0 }}>
          ${result.value.toLocaleString()}
        </div>
      )}

      <ArrowRight size={13} color="#252523" style={{ flexShrink: 0 }} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function GlobalSearch({ onClose }) {
  const navigate = useNavigate();
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState(null);   // null = not searched yet
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef   = useRef(null);
  const debounceRef = useRef(null);

  // Auto-focus on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Build flat list of results for keyboard nav
  const flatResults = results
    ? CATEGORIES.flatMap(cat =>
        (results[cat.key] || []).map(r => ({ ...r, _cat: cat.key, _route: cat.route }))
      )
    : [];

  // Debounced search
  const doSearch = useCallback((q) => {
    if (!q.trim()) { setResults(null); setLoading(false); return; }
    setLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchAll(q);
        setResults(data);
        setActiveIdx(0);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, []);

  function handleChange(e) {
    const q = e.target.value;
    setQuery(q);
    doSearch(q);
  }

  // Navigate to the entity's page with search pre-filled
  function goTo(result) {
    const cat = CATEGORIES.find(c => c.key === result._cat);
    if (!cat) return;
    navigate(`${cat.route}?search=${encodeURIComponent(result.name)}`);
    onClose();
  }

  // Keyboard navigation
  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (flatResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResults[activeIdx]) goTo(flatResults[activeIdx]);
    }
  }

  // Total results
  const total = results ? (results.total || 0) : 0;
  const hasResults = results && total > 0;
  const noResults  = results && total === 0 && query.trim();

  // Section headers needed?
  let flatIdx = 0;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#161614', border: '1px solid #252523', borderRadius: 14,
        width: 560, maxWidth: '92vw', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: '70vh',
      }}>

        {/* Search input row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #252523', flexShrink: 0 }}>
          {loading
            ? <Loader size={16} color="#4a4845" style={{ flexShrink: 0, animation: 'spin 0.7s linear infinite' }} />
            : <Search size={16} color="#4a4845" style={{ flexShrink: 0 }} />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search leads, contacts, deals, accounts, projects…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 15, color: '#e8e6df', caretColor: '#ff9b26',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a4845', display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <X size={15} />
            </button>
          )}
          <div style={{ fontSize: 11, color: '#252523', background: '#111110', border: '1px solid #252523', borderRadius: 5, padding: '2px 6px', flexShrink: 0 }}>
            ESC
          </div>
        </div>

        {/* Results area */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* Empty / start state */}
          {!query && !results && (
            <div style={{ padding: '28px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                return (
                  <div
                    key={cat.key}
                    onClick={() => { navigate(cat.route); onClose(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
                      background: cat.color + '15', border: `1px solid ${cat.color}30`,
                      fontSize: 12, color: cat.color, fontWeight: 600,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = cat.color + '30'}
                    onMouseLeave={e => e.currentTarget.style.background = cat.color + '15'}
                  >
                    <Icon size={13} /> {cat.label}
                  </div>
                );
              })}
            </div>
          )}

          {/* No results */}
          {noResults && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#4a4845' }}>
              <Search size={32} style={{ opacity: 0.2, marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>No results for "{query}"</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Try a name, email, company, or deal name</div>
            </div>
          )}

          {/* Results grouped by category */}
          {hasResults && CATEGORIES.map(cat => {
            const items = (results[cat.key] || []);
            if (items.length === 0) return null;
            const Icon = cat.icon;
            return (
              <div key={cat.key}>
                {/* Category header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 14px 4px', fontSize: 10, fontWeight: 700,
                  color: cat.color, textTransform: 'uppercase', letterSpacing: '0.09em',
                }}>
                  <Icon size={10} /> {cat.label}
                </div>
                {/* Result rows */}
                {items.map(result => {
                  const currentIdx = flatIdx++;
                  const withCat = { ...result, _cat: cat.key, _route: cat.route };
                  return (
                    <ResultRow
                      key={result.id}
                      result={withCat}
                      isActive={activeIdx === currentIdx}
                      onHover={() => setActiveIdx(currentIdx)}
                      onClick={() => goTo(withCat)}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* "View all in X" footer per section when results exist */}
          {hasResults && (
            <div style={{ padding: '8px 14px 12px', borderTop: '1px solid #111110', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {CATEGORIES.filter(cat => (results[cat.key] || []).length > 0).map(cat => (
                <button
                  key={cat.key}
                  onClick={() => { navigate(`${cat.route}?search=${encodeURIComponent(query)}`); onClose(); }}
                  style={{
                    background: 'none', border: '1px solid #252523', borderRadius: 6,
                    padding: '4px 10px', fontSize: 11, color: '#4a4845', cursor: 'pointer',
                    transition: 'color 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#7a7870'; e.currentTarget.style.borderColor = '#ff9b26'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#4a4845'; e.currentTarget.style.borderColor = '#252523'; }}
                >
                  All {cat.label} →
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{ padding: '7px 16px', borderTop: '1px solid #111110', display: 'flex', gap: 14, flexShrink: 0 }}>
          {[['↑↓', 'Navigate'], ['↵', 'Go to page'], ['ESC', 'Close']].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#4a4845' }}>
              <span style={{ background: '#111110', border: '1px solid #252523', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace', fontSize: 10, color: '#4a4845' }}>{key}</span>
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
