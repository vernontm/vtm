import React from 'react';

// Skeleton row for tables while data loads.
// Usage: {loading ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow cols={7} key={i} />) : rows}
export default function SkeletonRow({ cols = 5, widths }) {
  const w = widths && widths.length === cols
    ? widths
    : Array.from({ length: cols }, (_, i) => (i === 0 ? '55%' : (i === cols - 1 ? '30%' : `${50 + ((i * 13) % 30)}%`)));
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '13px 12px' }}>
          <div className="skeleton" style={{ height: 12, width: w[i] }} />
        </td>
      ))}
    </tr>
  );
}
