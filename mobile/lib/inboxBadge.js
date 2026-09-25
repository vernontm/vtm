import { useEffect, useState } from 'react';

// Tiny shared store for the Inbox unread count, so the dock can show its dot
// without every screen re-fetching. The Inbox list and Home update it after
// they load threads.
let count = 0;
const listeners = new Set();

export function setInboxUnread(n) {
  count = Number(n) || 0;
  listeners.forEach(fn => fn(count));
}

export function useInboxUnread() {
  const [n, setN] = useState(count);
  useEffect(() => {
    listeners.add(setN);
    return () => { listeners.delete(setN); };
  }, []);
  return n;
}

export const unreadOf = (threads) => (threads || []).reduce((s, t) => s + (Number(t.unread || t.unread_count || 0) > 0 ? 1 : 0), 0);
