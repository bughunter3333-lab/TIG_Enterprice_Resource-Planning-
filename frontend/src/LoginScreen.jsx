import React, { useState } from 'react';
import { auth } from './api';

export default function LoginScreen({ onLogin }) {
  const [step, setStep] = useState('credentials'); // 'credentials' | '2fa' | 'setup2fa'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      if (res.requires_2fa) {
        setStep('2fa');
      } else {
        onLogin(res.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await auth.verify2fa(code);
      onLogin(res.user);
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleSetup2FA = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await auth.setup2fa();
      setQrCode(res.qr_code);
      setStep('setup2fa');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm2FA = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await auth.confirm2fa(code);
      const user = await auth.me();
      onLogin(user);
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow">
            TIG
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Total Image Group</h1>
            <p className="text-xs text-gray-500">Enterprise Resource Planning</p>
          </div>
        </div>

        {/* Credentials Step */}
        {step === 'credentials' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700">Sign In</h2>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* 2FA Verify Step */}
        {step === '2fa' && (
          <form onSubmit={handle2FA} className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700">Two-Factor Authentication</h2>
            <p className="text-sm text-gray-500">Enter the 6-digit code from your authenticator app.</p>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoFocus
              className="w-full border rounded-lg px-3 py-3 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button type="button" onClick={() => setStep('credentials')} className="w-full text-sm text-gray-500 hover:text-gray-700">
              Back
            </button>
          </form>
        )}

        {/* 2FA Setup Step */}
        {step === 'setup2fa' && (
          <form onSubmit={handleConfirm2FA} className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700">Set Up Two-Factor Authentication</h2>
            <p className="text-sm text-gray-500">Scan this QR code with Google Authenticator or Authy, then enter the code to confirm.</p>
            {qrCode && (
              <div className="flex justify-center">
                <img src={`data:image/png;base64,${qrCode}`} alt="2FA QR Code" className="w-48 h-48 border rounded" />
              </div>
            )}
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="w-full border rounded-lg px-3 py-3 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Confirming...' : 'Activate 2FA'}
            </button>
          </form>
        )}

        {/* Setup 2FA prompt (shown after first login without 2FA) */}
        {step === 'credentials' && (
          <div className="mt-4 pt-4 border-t text-center">
            <button onClick={handleSetup2FA} className="text-xs text-blue-600 hover:underline">
              Set up two-factor authentication
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
