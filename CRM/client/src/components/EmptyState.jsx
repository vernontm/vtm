import React from 'react';
import { FolderOpen } from 'lucide-react';

// Narrative empty state — replaces "No X yet." lines throughout the CRM.
// Props:
//   icon        — a lucide component (defaults to FolderOpen)
//   title       — bold heading
//   description — sentence explaining what appears here
//   cta         — optional action button (React node)
export default function EmptyState({ icon: Icon = FolderOpen, title, description, cta, small = false }) {
  return (
    <div className="empty-state" style={small ? { padding: '36px 20px' } : undefined}>
      <div className="icon-wrap" style={small ? { width: 48, height: 48, borderRadius: 14 } : undefined}>
        <Icon size={small ? 20 : 26} />
      </div>
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
      {cta && <div className="empty-cta">{cta}</div>}
    </div>
  );
}
