import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const PrivacyContext = createContext({ privacyMode: false, togglePrivacy: () => {} });

// Money pattern: $1,234 · $1,234.56 · $1.2M · $900 · 1,200.00 · 7,532.91.
// Requires a $ OR a comma-grouped/decimal number so we don't blur plain counts
// like "200 contacts" or page numbers.
const MONEY_RE = /(?:\$\s?\d[\d,]*(?:\.\d+)?\s?[kKmMbB]?)|(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?)|(?:\d+\.\d{2}\b)/;

// Auto-blur runtime: when privacy mode is ON, walk the DOM and tag any *leaf*
// element whose visible text looks like a currency amount. Re-runs on DOM
// mutations (debounced) so freshly-rendered rows get covered too. This is the
// safety net that guarantees all financial info is masked even where a
// developer forgot to add the .private-value class by hand.
function usePrivacyAutoBlur(active) {
  const rafRef = useRef(0);

  const sweep = useCallback(() => {
    const candidates = document.querySelectorAll('span, td, b, strong, a, div, p, h1, h2, h3, h4');
    for (const el of candidates) {
      // Skip elements that hold child elements with their own text — we only
      // want leaf value nodes, not containers.
      let hasElementText = false;
      for (const child of el.children) {
        if (child.textContent && child.textContent.trim()) { hasElementText = true; break; }
      }
      if (hasElementText) continue;
      const txt = (el.textContent || '').trim();
      if (txt && txt.length <= 24 && MONEY_RE.test(txt)) {
        el.classList.add('pii-auto');
      }
    }
  }, []);

  useEffect(() => {
    if (!active) {
      document.querySelectorAll('.pii-auto').forEach(el => el.classList.remove('pii-auto'));
      return;
    }
    sweep();
    const schedule = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(sweep);
    };
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.addedNodes.length || m.type === 'characterData') { schedule(); break; }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { obs.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [active, sweep]);
}

export function PrivacyProvider({ children }) {
  const [privacyMode, setPrivacyMode] = useState(() => {
    try { return localStorage.getItem('vtm-privacy-mode') === '1'; } catch { return false; }
  });

  const togglePrivacy = useCallback(() => {
    setPrivacyMode(p => {
      const next = !p;
      try { localStorage.setItem('vtm-privacy-mode', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  // Put the class on <body> so it also covers portaled modals, drawers, and the
  // command palette — not just the app wrapper.
  useEffect(() => {
    document.body.classList.toggle('privacy-mode', privacyMode);
    return () => document.body.classList.remove('privacy-mode');
  }, [privacyMode]);

  usePrivacyAutoBlur(privacyMode);

  return (
    <PrivacyContext.Provider value={{ privacyMode, togglePrivacy }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export const usePrivacy = () => useContext(PrivacyContext);
