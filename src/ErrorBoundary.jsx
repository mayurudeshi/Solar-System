import { Component } from 'react';

// Catches any runtime error in the React tree and renders a fallback so
// the entire page doesn't go blank on a single component throw. Without
// this, a future R3F render crash (e.g. a bad texture URL or undefined
// orbital element) would silently unmount everything below the root.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface in production logs / Vercel runtime — Sentry would slot in here.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#03040a', color: '#cdd6e8',
            fontFamily: 'system-ui, sans-serif', padding: '24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 18, marginBottom: 12 }}>
            Solar System Explorer — render crash
          </div>
          <pre
            style={{
              maxWidth: 600, color: '#f0b54a', fontSize: 12,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}
          >
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 20, padding: '8px 16px',
              background: 'transparent', color: '#cdd6e8',
              border: '1px solid rgba(180,190,210,0.3)', borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
