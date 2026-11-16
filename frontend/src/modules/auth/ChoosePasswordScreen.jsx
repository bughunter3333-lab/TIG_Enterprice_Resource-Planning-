import { useEffect, useRef, useState } from 'react';
import { auth } from '../../api';
import { passwordProblem } from '../users/userRules';
import '../../LoginScreen.css';

/**
 * The step after signing in with a password an admin chose — a new account,
 * or one whose password was reset. That password is known to two people, so
 * the person picks their own before anything else; until they do, the server
 * answers nothing but who they are (core/dependencies.py, get_current_user).
 *
 * Laid out as the sign-in card, since it is the last part of signing in.
 */
export default function ChoosePasswordScreen({ user, onDone, onLogout }) {
  const [given, setGiven] = useState('');
  const [chosen, setChosen] = useState('');
  const [again, setAgain] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // The first field to fix after a refused save — a new object each time,
  // so the same field is focused again on a second refusal.
  const [refused, setRefused] = useState(null);
  const inputs = useRef({});

  const givenProblem = given ? null : 'Enter the password you signed in with.';
  const chosenProblem = passwordProblem(chosen)
    ?? (chosen && chosen === given ? 'It has to be different from the one you were given.' : null);
  const againProblem = again === chosen ? null : 'The two new passwords are not the same.';
  const problems = [['choose-given', givenProblem], ['choose-new', chosenProblem], ['choose-again', againProblem]];

  // A refused save takes the cursor to the first field to fix. After the render
  // that marks the fields, so a screen reader reads why along with the field.
  useEffect(() => {
    if (refused) inputs.current[refused.id]?.focus();
  }, [refused]);

  const save = async (e) => {
    e.preventDefault();
    setTried(true);
    setError('');
    const first = problems.find(([, problem]) => problem);
    if (first) {
      setRefused({ id: first[0] });
      return;
    }
    setSaving(true);
    try {
      await auth.changePassword(given, chosen);
    } catch (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    // The password has changed, and this browser was signed in afresh with it.
    // Who they are is read back from that; if the reading fails, the change has
    // still happened, and saying otherwise would send them back to a password
    // that no longer works.
    onDone(await auth.me().catch(() => ({ ...user, must_change_password: false })));
  };

  const field = (id, label, value, onChange, autoComplete, problem, { autoFocus, note } = {}) => {
    const describedBy = [tried && problem ? `${id}-problem` : null, note].filter(Boolean).join(' ');
    return (
      <div className="signin-field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id} ref={(el) => { inputs.current[id] = el; }} type="password" value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} autoFocus={autoFocus} maxLength={200}
          aria-invalid={tried && problem ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        {tried && problem && <p id={`${id}-problem`} className="signin-field-problem">{problem}</p>}
      </div>
    );
  };

  return (
    <div className="signin">
      <main className="signin-card">
        <form onSubmit={save} noValidate aria-label="Choose your own password">
          <header className="signin-head">
            <div className="signin-brand">
              <span className="signin-mark" aria-hidden="true">TIG</span>
              <span className="signin-product">Total Image</span>
            </div>
            <h1>Choose your own password</h1>
            <p>
              {user?.full_name ? `${user.full_name}, you` : 'You'} signed in with a password someone gave you.
              Choose one only you know before going on.
            </p>
          </header>

          {error && <div className="signin-error" role="alert"><span>{error}</span></div>}

          {/* For a password manager: whose password the new one is. */}
          <input type="text" name="username" autoComplete="username" value={user?.username ?? ''} readOnly hidden />
          {field('choose-given', 'The password you were given', given, setGiven, 'current-password', givenProblem, { autoFocus: true })}
          {field('choose-new', 'Your new password', chosen, setChosen, 'new-password', chosenProblem, { note: 'choose-rules' })}
          <p id="choose-rules" className="signin-note">At least 8 characters, with an uppercase letter and a digit.</p>
          {field('choose-again', 'The new password again', again, setAgain, 'new-password', againProblem)}

          <button type="submit" className="signin-btn" disabled={saving}>
            {saving ? <><span className="signin-spinner" aria-hidden="true" />Saving</> : 'Save and continue'}
          </button>
          <button type="button" className="signin-link" onClick={onLogout}>Sign out</button>
        </form>
      </main>
      <footer className="signin-foot">Total Image Group · internal system · Sydney</footer>
    </div>
  );
}
