import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('App error boundary caught:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    // Full reload ensures stale state (context, refs) is cleared
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || 'An unexpected error occurred.';
    return (
      <div style={{
        minHeight: '100vh', background: '#f5f7fa',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{
          maxWidth: 480, background: '#fff', border: '1px solid #e5e7ef',
          borderRadius: 12, padding: '28px 32px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          textAlign: 'center',
        }}>
          <div style={{ display: 'inline-flex', padding: 12, borderRadius: 999, background: '#ff5c5c15', marginBottom: 14 }}>
            <AlertTriangle size={28} color="#ff5c5c" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, margin: '0 0 18px' }}>
            The app hit an error and can't continue on this page. Reloading usually fixes it.
            If it happens again, take a screenshot and send it to Ray.
          </p>
          <details style={{ textAlign: 'left', background: '#f5f7fa', border: '1px solid #e5e7ef', borderRadius: 8, padding: '8px 12px', marginBottom: 18 }}>
            <summary style={{ fontSize: 12, color: '#8e8ea0', cursor: 'pointer', fontWeight: 600 }}>Technical details</summary>
            <pre style={{ fontSize: 11, color: '#4b5563', margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg}</pre>
          </details>
          <button
            onClick={this.handleReload}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', borderRadius: 8, background: '#4a6cf7',
              color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} /> Reload app
          </button>
        </div>
      </div>
    );
  }
}
