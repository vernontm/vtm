import { useState, useEffect, useMemo } from 'react';
import { getRecommendations } from '../api';
import { Loader, ExternalLink, Star } from 'lucide-react';

const cardStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column',
};

const btnStyle = {
  padding: '10px 20px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
  color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
};

export default function Recommendations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    getRecommendations()
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(err => console.error('Failed to load recommendations:', err))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category).filter(Boolean));
    return ['All', ...Array.from(cats)];
  }, [items]);

  const filtered = activeCategory === 'All'
    ? items
    : items.filter(i => i.category === activeCategory);

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={28} className="spin" style={{ color: '#E8650A' }} />
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>Recommendations</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Tools and resources we recommend.
      </p>

      {/* Category Tabs */}
      {categories.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)',
                background: activeCategory === cat ? 'linear-gradient(135deg, #E8650A, #ff8c3a)' : 'var(--bg-card)',
                color: activeCategory === cat ? '#fff' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
          textAlign: 'center', padding: 48,
        }}>
          <Star size={32} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No recommendations yet. Check back soon!</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 20,
        }}>
          {filtered.map(item => (
            <div key={item.id} style={cardStyle}>
              {item.image_url ? (
                <img src={item.image_url} alt="" style={{ width: '100%', height: 160, objectFit: 'cover' }} />
              ) : (
                <div style={{
                  width: '100%', height: 160, background: 'var(--bg-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Star size={36} style={{ color: 'var(--text-muted)' }} />
                </div>
              )}
              <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, flex: 1, lineHeight: 1.5 }}>
                  {item.description}
                </p>
                <a
                  href={item.affiliate_url || item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={btnStyle}
                >
                  Check it out <ExternalLink size={14} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
