import { useEffect, useState } from 'react';
import { T } from '../tokens';
import { health } from '../../api';

const POLL_MS = 60000;

export default function StatusBar({ currentUser }) {
  const [online, setOnline] = useState(null); // null = checking

  useEffect(() => {
    let alive = true;
    const ping = () =>
      health.check()
        .then(() => { if (alive) setOnline(true); })
        .catch(() => { if (alive) setOnline(false); });
    ping();
    const t = setInterval(ping, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const dotColor = online == null ? T.textFaint : online ? '#4ade80' : '#f87171';

  return (
    <div style={{
      height: 24, background: T.chrome, display: 'flex', alignItems: 'center',
      padding: '0 10px', gap: 14, flexShrink: 0, fontFamily: T.font,
    }}>
      <span style={{ fontSize: 10.5, color: T.chromeTextMuted }}>User: {currentUser?.username ?? '—'}</span>
      {currentUser?.role && <span style={{ fontSize: 10.5, color: T.chromeTextMuted, textTransform: 'capitalize' }}>{currentUser.role}</span>}
      <span style={{ fontSize: 10.5, color: T.chromeTextMuted }}>Total Image Group</span>
      <div style={{ flex: 1 }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: T.chromeTextMuted }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor }} />
        {online == null ? 'Checking…' : online ? 'Connected' : 'Offline'}
      </span>
    </div>
  );
}
