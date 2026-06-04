import React, { useState, useRef } from 'react';
import { auth } from './api';

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

  const inputCls = 'w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors';
  const btnPrimary = 'w-full bg-blue-700 text-white py-2.5 rounded font-semibold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm';
  const errBox = (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2.5 rounded">
      <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {error}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#edf2f7]">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-2/5 bg-[#1e3a8a] flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative z-10 flex flex-col items-center text-center">
          <img src="/logo.svg" alt="Total Image Group" className="h-16 w-auto object-contain brightness-0 invert mb-10"
            onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }} />
          <div className="hidden flex-col items-center mb-10">
            <div className="w-14 h-14 rounded border border-white/20 bg-white/10 flex items-center justify-center text-white font-black text-xl mb-4">TIG</div>
          </div>

          <h2 className="text-white text-2xl font-bold leading-snug mb-2">Enterprise Resource<br />Planning</h2>
          <p className="text-blue-200/70 text-sm max-w-xs leading-relaxed">
            Jobs · Inventory · Customers · Suppliers · Purchasing · Reports
          </p>

          <div className="flex flex-wrap justify-center gap-1.5 mt-8">
            {['Job Tracking','Stock Control','Purchase Orders','Invoicing','Reporting','Warehouse'].map(f => (
              <span key={f} className="text-xs text-blue-200/70 bg-white/8 border border-white/10 px-2.5 py-0.5 rounded-full">
                {f}
              </span>
            ))}
          </div>
        </div>

        <p className="absolute bottom-5 text-blue-300/30 text-xs tracking-widest uppercase">
          Total Image Group
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex lg:hidden justify-center mb-6">
            <img src="/logo.svg" alt="Total Image Group" className="h-10 w-auto object-contain"
              onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'block'; }} />
            <span className="hidden text-lg font-bold text-slate-800">Total Image Group</span>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-7">

            {/* Credentials Step */}
            {step === 'credentials' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="mb-5 pb-4 border-b border-slate-100">
                  <h2 className="text-xl font-bold text-slate-800">Sign In</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Total Image Group ERP</p>
                </div>

                {error && errBox}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Username</label>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); passwordRef.current?.focus(); } }}
                    required autoFocus autoComplete="username" placeholder="Enter your username" className={inputCls} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
                  <div className="relative">
                    <input ref={passwordRef} type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)}
                      required autoComplete="current-password" placeholder="Enter your password"
                      className={inputCls + ' pr-10'} />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading || !username || !password} className={btnPrimary}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Signing in…
                    </span>
                  ) : 'Sign In'}
                </button>

                <div className="pt-2 border-t border-slate-100 text-center">
                  <button type="button" onClick={handleSetup2FA}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                    Set up two-factor authentication
                  </button>
                </div>
              </form>
            )}

            {/* 2FA Verify Step */}
            {step === '2fa' && (
              <form onSubmit={handle2FA} className="space-y-4">
                <div className="mb-5 pb-4 border-b border-slate-100">
                  <div className="w-10 h-10 rounded bg-blue-50 border border-blue-200 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-slate-800">Two-Factor Authentication</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Enter the 6-digit code from your authenticator app</p>
                </div>

                {error && errBox}

                <input type="text" inputMode="numeric" value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000 000" maxLength={6} autoFocus
                  className="w-full border-2 border-slate-200 rounded px-4 py-4 text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:border-blue-500 transition-colors bg-slate-50 focus:bg-white" />

                <div className="flex justify-center gap-2">
                  {[0,1,2,3,4,5].map(i => (
                    <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i < code.length ? 'bg-blue-700' : 'bg-slate-200'}`} />
                  ))}
                </div>

                <button type="submit" disabled={loading || code.length !== 6} className={btnPrimary}>
                  {loading ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Verifying…</span> : 'Verify Code'}
                </button>

                <button type="button" onClick={() => { setStep('credentials'); setCode(''); setError(''); }}
                  className="w-full text-sm text-slate-500 hover:text-slate-700 py-1 transition-colors">
                  ← Back to sign in
                </button>
              </form>
            )}

            {/* 2FA Setup Step */}
            {step === 'setup2fa' && (
              <form onSubmit={handleConfirm2FA} className="space-y-4">
                <div className="mb-4 pb-4 border-b border-slate-100">
                  <h2 className="text-xl font-bold text-slate-800">Set Up 2FA</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Scan with Google Authenticator or Authy, then enter the confirmation code.</p>
                </div>

                {qrCode && (
                  <div className="flex justify-center">
                    <div className="p-3 bg-white border border-slate-200 rounded shadow-sm">
                      <img src={`data:image/png;base64,${qrCode}`} alt="2FA QR Code" className="w-44 h-44 rounded" />
                    </div>
                  </div>
                )}

                {error && errBox}

                <input type="text" inputMode="numeric" value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000 000" maxLength={6} autoFocus
                  className="w-full border-2 border-slate-200 rounded px-4 py-4 text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:border-blue-500 transition-colors bg-slate-50 focus:bg-white" />

                <div className="flex justify-center gap-2">
                  {[0,1,2,3,4,5].map(i => (
                    <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i < code.length ? 'bg-blue-700' : 'bg-slate-200'}`} />
                  ))}
                </div>

                <button type="submit" disabled={loading || code.length !== 6} className={btnPrimary}>
                  {loading ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Activating…</span> : 'Activate 2FA'}
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-xs text-slate-400 mt-5">
            Total Image Group ERP · Internal Use Only
          </p>
        </div>
      </div>
    </div>
  );
}
