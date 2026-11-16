import { useState, useEffect } from 'react';
import LoginScreen from './LoginScreen';
import TotalImageERP from './TotalImageERP';
import ChoosePasswordScreen from './modules/auth/ChoosePasswordScreen';
import { auth } from './api';
import { resetCrashContext, setSignedIn } from './lib/crashContext';
import { resetRecorded } from './modules/crash-reports/reporter';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    auth.me()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null))
      .finally(() => setChecking(false));

    const handleLogout = () => setCurrentUser(null);
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  // Crash reports go only from someone signed in; on sign-out the steps go
  // too, so the next person on this browser never sends the last one's.
  useEffect(() => {
    setSignedIn(!!currentUser);
    if (!currentUser) {
      resetCrashContext();
      resetRecorded();
    }
  }, [currentUser]);

  const handleLogout = async () => {
    await auth.logout().catch(() => {});
    setCurrentUser(null);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-hairline-soft flex items-center justify-center">
        <div className="text-muted text-sm">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />;
  }

  // Signed in with a password an admin chose: the server answers nothing else
  // until the person has replaced it.
  if (currentUser.must_change_password) {
    return <ChoosePasswordScreen user={currentUser} onDone={setCurrentUser} onLogout={handleLogout} />;
  }

  return <TotalImageERP currentUser={currentUser} onLogout={handleLogout} />;
}
