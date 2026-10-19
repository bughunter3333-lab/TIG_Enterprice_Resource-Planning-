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
      {/* Two tiers: static context stays muted, the two values that actually
          change (who you are, whether you're connected) are promoted. Every
          item sat at one size and colour before, so nothing read as live. */}
      <span style={{ fontSize: 10, color: T.chromeTextMuted }}>
        User: <span style={{ color: T.chromeText, fontWeight: 600 }}>{currentUser?.username ?? '—'}</span>
      </span>
      {currentUser?.role && <span style={{ fontSize: 10, color: T.chromeTextMuted, textTransform: 'capitalize' }}>{currentUser.role}</span>}
      <span style={{ fontSize: 10, color: T.chromeTextMuted }}>Total Image</span>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 10, color: T.chromeTextMuted, fontFamily: T.mono ?? 'monospace' }} title="Deployed build id">
        build {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.chromeText, fontWeight: 600 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor }} />
        {online == null ? 'Checking…' : online ? 'Connected' : 'Offline'}
      </span>
    </div>
  );
}
