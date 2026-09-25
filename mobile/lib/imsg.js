// Shared helpers + tokens for the iMessage inbox screens.
import { C } from './theme';

export const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

export const fmtPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  const ten = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return p || '';
};

export const fmtTime = (t) => {
  if (!t) return '';
  const d = new Date(t), now = new Date();
  if (isNaN(d)) return '';
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const fmtDateTime = (t) => {
  if (!t) return '';
  const d = new Date(t);
  return isNaN(d) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const KIND = {
  lead:    { label: 'Lead',    color: C.amber },
  client:  { label: 'Client',  color: C.green },
  contact: { label: 'Contact', color: C.blue },
};

export const TEMPS = [
  { key: 'cold', label: 'Cold', color: '#1d4ed8' },
  { key: 'warm', label: 'Warm', color: C.amber },
  { key: 'hot',  label: 'Hot',  color: C.red },
];
export const tempOf = (k) => TEMPS.find(t => t.key === k);

// A stable, distinct color per employee.
const EMP_COLORS = ['#2563eb', '#7c3aed', '#c026d3', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#4f46e5'];
export const colorForEmployee = (id) => {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return EMP_COLORS[h % EMP_COLORS.length];
};
