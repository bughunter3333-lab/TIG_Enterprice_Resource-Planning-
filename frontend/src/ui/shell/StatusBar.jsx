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

  const dotColor = online == null ? T.textFaint : online ? T.ok : T.danger;

  return (
    <div style={{
      height: 26, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
      padding: '0 24px', fontFamily: T.font, fontSize: 11, color: T.textFaint,
      borderTop: `1px solid ${T.hairlineSoft}`, background: T.page,
    }}>
      {/* Two tiers: static context stays quiet; the two values that change
          (who you are, whether you are connected) are promoted. */}
      <span>
        User: <span style={{ color: T.textMuted, fontWeight: 500 }}>{currentUser?.username ?? '—'}</span>
      </span>
      {currentUser?.role && <span style={{ textTransform: 'capitalize' }}>{currentUser.role}</span>}
      <span>Total Image</span>
      <div style={{ flex: 1 }} />
      <span style={{ fontFamily: T.fontMono, fontSize: 10.5 }} title="Deployed build id">
        build {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: T.textMuted, fontWeight: 500 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor }} />
        {online == null ? 'Checking…' : online ? 'Connected' : 'Offline'}
      </span>
    </div>
  );
}
