import { useState, useRef } from 'react';
import { auth } from './api';
import './LoginScreen.css';

/**
 * Sign-in, in the SAP Fiori Horizon world the rest of the application now
 * uses: a single card on Horizon's light ground, labelled fields, one
 * emphasized action.
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

  const errBox = error && (
    <div className="signin-error" role="alert">
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{error}</span>
    </div>
  );

  const spinner = <span className="signin-spinner" aria-hidden="true" />;

  const pips = (
    <div className="signin-pips" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map(i => <i key={i} className={i < code.length ? 'on' : undefined} />)}
    </div>
  );

  const codeInput = (
    <input
      type="text" inputMode="numeric" value={code}
      onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000" maxLength={6} autoFocus autoComplete="one-time-code"
      className="signin-code" aria-label="Six digit authentication code"
    />
  );

  const heading = (title, sub) => (
    <header className="signin-head">
      <div className="signin-brand">
        <span className="signin-mark" aria-hidden="true">TIG</span>
        <span className="signin-product">Total Image</span>
      </div>
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </header>
  );

  return (
    <div className="signin">
      <main className="signin-card">
        {step === 'credentials' && (
          <form onSubmit={handleLogin}>
            {heading('Sign in', 'Decorated apparel — jobs, stock, purchasing, despatch and invoicing')}
            {errBox}

            <div className="signin-field">
              <label htmlFor="signin-user">Username</label>
              <input
                id="signin-user" type="text" value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); passwordRef.current?.focus(); } }}
                required autoFocus autoComplete="username"
              />
            </div>

            <div className="signin-field">
              <label htmlFor="signin-pass">Password</label>
              <div className="signin-pass">
                <input
                  id="signin-pass" ref={passwordRef} type={showPassword ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  required autoComplete="current-password"
                />
                <button
                  type="button" className="signin-reveal" onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="signin-btn" disabled={loading || !username || !password}>
              {loading ? <>{spinner}Signing in</> : 'Sign in'}
            </button>

            <button type="button" className="signin-link" onClick={handleSetup2FA}>
              Set up two-factor authentication
            </button>
          </form>
        )}

        {step === '2fa' && (
          <form onSubmit={handle2FA}>
            {heading('Verify it’s you', 'Enter the six-digit code from your authenticator app.')}
            {errBox}
            {codeInput}
            {pips}
            <button type="submit" className="signin-btn" disabled={loading || code.length !== 6}>
              {loading ? <>{spinner}Verifying</> : 'Verify'}
            </button>
            <button
              type="button" className="signin-link"
              onClick={() => { setStep('credentials'); setCode(''); setError(''); }}
            >
              Back to sign in
            </button>
          </form>
        )}

        {step === 'setup2fa' && (
          <form onSubmit={handleConfirm2FA}>
            {heading('Set up two-factor', 'Scan the code with your authenticator app, then enter the code it shows.')}
            {qrCode && (
              <div className="signin-qr">
                <img src={`data:image/png;base64,${qrCode}`} alt="Two-factor setup QR code" width={168} height={168} />
              </div>
            )}
            {errBox}
            {codeInput}
            {pips}
            <button type="submit" className="signin-btn" disabled={loading || code.length !== 6}>
              {loading ? <>{spinner}Activating</> : 'Activate'}
            </button>
          </form>
        )}
      </main>

      <footer className="signin-foot">Total Image Group · internal system · Sydney</footer>
    </div>
  );
}
