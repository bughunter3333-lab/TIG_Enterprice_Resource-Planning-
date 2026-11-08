import { Component } from 'react';
import { RotateCw, Send } from 'lucide-react';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import { isSignedIn, reportProblem } from '../../lib/crashContext';
import { markCaught, recordCrash } from './reporter';

/**
 * Catches a crash so it is a calm panel, not a white page — and records it
 * before anyone decides whether to report it.
 *
 * `variant="page"` stands round the whole app (nothing else is left to show);
 * `variant="screen"` round one screen, inside the shell, so the sidebar still
 * works and moving to another screen (`resetKey`) clears the crash.
 */
export default class CrashBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, crashId: null };
    this.mounted = false;
  }

  static getDerivedStateFromError(error) {
    markCaught(error); // recorded here, as a crash — not again as an error
    return { error, crashId: null };
  }

  componentDidMount() {
    this.mounted = true;
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  componentDidCatch(error, info) {
    // The recording belongs to this crash: a later one does not take its id,
    // and Report waits for it rather than sending a second report.
    this.recording = recordCrash({ kind: 'crash', error, componentStack: info?.componentStack ?? null });
    this.recording.then((crashId) => {
      if (this.mounted && this.state.error === error) this.setState({ crashId });
    });
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, crashId: null });
    }
  }

  render() {
    const { error, crashId } = this.state;
    if (!error) return this.props.children;
    return (
      <RecoveryPanel
        variant={this.props.variant ?? 'screen'}
        recorded={crashId !== null}
        canReport={isSignedIn()}
        onReport={() => reportProblem({ kind: 'crash', crashId, crashIdPromise: this.recording, error })}
        onRetry={() => this.setState({ error: null, crashId: null })}
      />
    );
  }
}

export function RecoveryPanel({ variant, recorded, canReport = true, onReport, onRetry }) {
  const page = variant === 'page';
  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.font,
        minHeight: page ? '100vh' : 320, padding: 24, background: page ? T.page : 'transparent',
      }}
    >
      <div style={{ maxWidth: 460, background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg, padding: '24px 28px', boxShadow: T.shadowSm }}>
        <h2 style={{ margin: '0 0 8px', fontSize: T.fsSection, fontWeight: 600, color: T.text }}>
          {page ? 'The app stopped working' : 'This screen stopped working'}
        </h2>
        <p style={{ margin: '0 0 6px', fontSize: T.fsBase, color: T.text, lineHeight: 1.5 }}>
          Anything you saved is safe. Reloading usually puts it right.
        </p>
        <p style={{ margin: '0 0 18px', fontSize: T.fsSmall, color: T.textMuted, lineHeight: 1.5 }}>
          {!canReport
            ? 'Sign in and try again; if it happens again, tell the team what you were doing.'
            : recorded
              ? 'It has been recorded for the team. Telling them what you were doing, with a picture, helps them fix it.'
              : 'Telling the team what you were doing, with a picture, helps them fix it.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canReport && <Button variant="primary" onClick={onReport}><Send size={14} aria-hidden />Report what happened</Button>}
          {!page && <Button onClick={onRetry}>Try again</Button>}
          <Button variant="ghost" onClick={() => window.location.reload()}><RotateCw size={14} aria-hidden />Reload the app</Button>
        </div>
      </div>
    </div>
  );
}
