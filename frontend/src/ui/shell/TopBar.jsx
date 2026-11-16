import { useEffect, useRef } from 'react';
import { Bell, Bug, Lock, Plus, Search, Sparkles } from 'lucide-react';
import { T } from '../tokens';
import Button from '../Button';
import { canCall } from '../../lib/access';
import { useMyAccess } from '../../lib/useMyAccess';
import { reportProblem } from '../../lib/crashContext';

// The assistant (modules/ai/AIAssistantPanel) owns its open state and opens on
// this event, so the shell does not have to be wired to it.
export const OPEN_ASSISTANT = 'tig:open-assistant';

const iconButton = {
  appearance: 'none', cursor: 'pointer', width: 34, height: 34, flexShrink: 0, position: 'relative',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid transparent', borderRadius: T.radius, background: 'transparent', color: T.textMuted,
  transition: `background ${T.transition}, color ${T.transition}`,
};
const hoverOn = (e) => { e.currentTarget.style.background = T.hairlineSoft; e.currentTarget.style.color = T.text; };
const hoverOff = (e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; };

/**
 * The slim bar over the page: where you are, search (Ctrl+K), the assistant,
 * what is overdue, and the one thing most people come to do — a new job.
 */
export default function TopBar({
  title, adminMode, onAdminToggle, currentUser, onNewJob, searchValue = '', onSearchChange, notifCount = 0,
}) {
  const searchRef = useRef(null);
  const { data: access } = useMyAccess();
  // Offered until access says otherwise; the server refuses it either way.
  const canAddJob = !access || canCall(access, 'POST', '/jobs');

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header style={{
      height: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', flexShrink: 0,
      background: T.chrome, boxShadow: T.shadowChrome, fontFamily: T.font, position: 'relative', zIndex: 20,
    }}>
      <span style={{ fontSize: T.fsBase, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
        {title}
      </span>
      <div style={{ flex: 1 }} />

      <label style={{
        display: 'flex', alignItems: 'center', gap: 8, height: 34, width: 300, padding: '0 6px 0 10px',
        background: T.panelAlt, border: `1px solid ${T.hairline}`, borderRadius: T.radius, cursor: 'text',
      }}>
        <Search size={15} color={T.textFaint} aria-hidden />
        <input
          ref={searchRef}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search…"
          aria-label="Search"
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: T.fsGrid, color: T.text, fontFamily: T.font }}
        />
        <kbd aria-hidden style={{
          fontFamily: T.fontMono, fontSize: 10, color: T.textMuted, padding: '1px 5px',
          border: `1px solid ${T.hairline}`, borderRadius: 4, background: T.panel,
        }}>Ctrl K</kbd>
      </label>

      <Button onClick={() => window.dispatchEvent(new Event(OPEN_ASSISTANT))} title="Ask about jobs, stock and customers">
        <Sparkles size={14} aria-hidden />Ask
      </Button>

      {/* Anything wrong, crash or not: the report dialog, with a picture of this screen. */}
      <button
        type="button"
        aria-label="Report a problem"
        title="Report a problem"
        onClick={() => reportProblem({ kind: 'report' })}
        style={iconButton}
        onMouseEnter={hoverOn}
        onMouseLeave={hoverOff}
      >
        <Bug size={16} aria-hidden />
      </button>

      <div
        role="status"
        aria-label={notifCount > 0 ? `${notifCount} overdue jobs` : 'No notifications'}
        title={notifCount > 0 ? `${notifCount} overdue jobs` : 'No notifications'}
        style={{ ...iconButton, cursor: 'default' }}
      >
        <Bell size={17} aria-hidden />
        {notifCount > 0 && (
          <span aria-hidden style={{
            position: 'absolute', top: 3, right: 2, minWidth: 16, height: 16, padding: '0 4px',
            background: T.danger, color: '#fff', borderRadius: 8, fontSize: 10, fontWeight: 600,
            lineHeight: '16px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', boxShadow: `0 0 0 2px ${T.chrome}`,
          }}>
            {notifCount > 99 ? '99+' : notifCount}
          </span>
        )}
      </div>

      {currentUser?.role === 'admin' && (
        <button
          type="button"
          aria-label="Admin Tools"
          aria-pressed={!!adminMode}
          title={adminMode ? 'Exit Admin' : 'Admin Tools'}
          onClick={onAdminToggle}
          style={{ ...iconButton, background: adminMode ? T.accentTint : 'transparent', color: adminMode ? T.accentStrong : T.textMuted }}
          onMouseEnter={(e) => { if (!adminMode) hoverOn(e); }}
          onMouseLeave={(e) => { if (!adminMode) hoverOff(e); }}
        >
          <Lock size={16} aria-hidden />
        </button>
      )}

      {/* Quiet, not blue: the page's own primary action (or a record's next
          step) is the one blue on the screen. */}
      {canAddJob && (
        <Button onClick={onNewJob}>
          <Plus size={15} aria-hidden />New Job
        </Button>
      )}
    </header>
  );
}
