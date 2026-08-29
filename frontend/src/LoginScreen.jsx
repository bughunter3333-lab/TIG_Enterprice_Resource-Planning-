import { useState, useRef } from 'react';
import { auth } from './api';
import './LoginScreen.css';

/**
 * Sign-in, built as a press sheet.
 *
 * The business puts ink and thread onto garments, so the screen borrows the
 * print floor rather than the SaaS login card it used to be: newsprint stock,
 * trim marks, a CMYK colour bar, and a wordmark that resolves out of
 * misregistration on load the way a press comes into register.
 *
 * All four steps of the auth flow are unchanged — credentials, 2FA verify, 2FA
 * setup, and the errors between them. Only the presentation moved.
 */
export default function LoginScreen({ onLogin }) {
  const [step, setStep] = useState('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef(null);
  const [code, setCode] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await auth.login(username, password);
      if (res.requires_2fa) { setStep('2fa'); } else { onLogin(res.user); }
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const handle2FA = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { const res = await auth.verify2fa(code); onLogin(res.user); }
    catch (err) { setError(err.message); setCode(''); } finally { setLoading(false); }
  };

  const handleSetup2FA = async () => {
    setError(''); setLoading(true);
    try { const res = await auth.setup2fa(); setQrCode(res.qr_code); setStep('setup2fa'); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const handleConfirm2FA = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await auth.confirm2fa(code); const user = await auth.me(); onLogin(user); }
    catch (err) { setError(err.message); setCode(''); } finally { setLoading(false); }
  };

  const trim = (pos) => (
    <div className={`press-trim press-trim--${pos}`} style={{ animationDelay: '80ms' }}>
      <span /><span />
    </div>
  );

  const errBox = error && (
    <div className="press-error" role="alert">
      <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{error}</span>
    </div>
  );

  const spinner = (
    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );

  const pips = (
    <div className="press-pips">
      {[0, 1, 2, 3, 4, 5].map(i => <i key={i} className={i < code.length ? 'on' : undefined} />)}
    </div>
  );

  const codeInput = (
    <input
      type="text" inputMode="numeric" value={code}
      onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000" maxLength={6} autoFocus
      className="press-code" aria-label="Six digit authentication code"
    />
  );

  return (
    <div className="press">
      {trim('tl')}{trim('tr')}{trim('bl')}{trim('br')}

      <div className="press-sheet">
        {/* ── Plate ─────────────────────────────────────────────────────── */}
        <div>
          <div className="press-bar" aria-hidden="true">
            {[
              ['var(--cyan)', '160ms'],
              ['var(--magenta)', '230ms'],
              ['var(--yellow)', '300ms'],
              ['var(--ink)', '370ms'],
            ].map(([c, d]) => (
              <i key={c} style={{ background: c, animationDelay: d }} />
            ))}
          </div>

          <div className="press-mark">
            <h1 className="press-plate press-plate--c" aria-hidden="true">Total<br />Image</h1>
            <h1 className="press-plate press-plate--m" aria-hidden="true">Total<br />Image</h1>
            <h1 className="press-plate press-plate--k">Total<br />Image</h1>
          </div>

          <div className="press-rule" />

          <p className="press-standfirst press-in" style={{ animationDelay: '820ms' }}>
            <b>Decorated apparel</b> — production control<br />
            Jobs · Stock · Purchasing · Despatch · Invoicing
          </p>
        </div>

        {/* ── Docket ────────────────────────────────────────────────────── */}
        <div className="press-panel press-in" style={{ animationDelay: '560ms' }}>

          {step === 'credentials' && (
            <form onSubmit={handleLogin}>
              <div className="press-panel-head">
                <h2>Sign in</h2>
                {/* No logo here on purpose. logo.svg is itself a wordmark of
                    the company name, so beside the 9.5rem one on the left it
                    says the same thing twice, in an indigo that fights the CMYK
                    palette. The docket keeps this head consistent with the two
                    2FA steps. */}
                <span className="press-docket">Access</span>
              </div>

              {errBox}

              <div className="press-field">
                <label className="press-label" htmlFor="press-user">Operator</label>
                <input
                  id="press-user" type="text" value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); passwordRef.current?.focus(); } }}
                  required autoFocus autoComplete="username" placeholder="username"
                />
              </div>

              <div className="press-field">
                <label className="press-label" htmlFor="press-pass">Passphrase</label>
                <input
                  id="press-pass" ref={passwordRef} type={showPassword ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  required autoComplete="current-password" placeholder="••••••••"
                  style={{ paddingRight: '2rem' }}
                />
                <button
                  type="button" className="press-reveal" onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>

              <button type="submit" className="press-btn" disabled={loading || !username || !password}>
                {loading
                  ? <span className="flex items-center justify-center gap-2">{spinner}Signing in</span>
                  : 'Run job'}
              </button>

              <div style={{ marginTop: '1.4rem', textAlign: 'center' }}>
                <button type="button" className="press-link" onClick={handleSetup2FA}>
                  Set up two-factor
                </button>
              </div>
            </form>
          )}

          {step === '2fa' && (
            <form onSubmit={handle2FA}>
              <div className="press-panel-head">
                <h2>Verify</h2>
                <span className="press-docket">2FA</span>
              </div>

              <p className="press-label" style={{ marginBottom: '1.1rem', letterSpacing: '0.12em' }}>
                Six-digit code from your authenticator
              </p>

              {errBox}
              {codeInput}
              {pips}

              <div style={{ marginTop: '1.5rem' }}>
                <button type="submit" className="press-btn" disabled={loading || code.length !== 6}>
                  {loading
                    ? <span className="flex items-center justify-center gap-2">{spinner}Verifying</span>
                    : 'Verify'}
                </button>
              </div>

              <div style={{ marginTop: '1.4rem', textAlign: 'center' }}>
                <button
                  type="button" className="press-link"
                  onClick={() => { setStep('credentials'); setCode(''); setError(''); }}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          {step === 'setup2fa' && (
            <form onSubmit={handleConfirm2FA}>
              <div className="press-panel-head">
                <h2>Enrol</h2>
                <span className="press-docket">2FA setup</span>
              </div>

              <p className="press-label" style={{ marginBottom: '1.1rem', letterSpacing: '0.12em' }}>
                Scan, then enter the confirmation code
              </p>

              {qrCode && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.2rem' }}>
                  <div style={{ padding: 10, background: '#fff', border: '1px solid var(--ink)' }}>
                    <img src={`data:image/png;base64,${qrCode}`} alt="Two-factor setup QR code"
                      style={{ width: 168, height: 168, display: 'block' }} />
                  </div>
                </div>
              )}

              {errBox}
              {codeInput}
              {pips}

              <div style={{ marginTop: '1.5rem' }}>
                <button type="submit" className="press-btn" disabled={loading || code.length !== 6}>
                  {loading
                    ? <span className="flex items-center justify-center gap-2">{spinner}Activating</span>
                    : 'Activate'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="press-foot">
        <span>Total Image — internal system</span>
        <span>Sydney · AU</span>
      </div>
    </div>
  );
}
