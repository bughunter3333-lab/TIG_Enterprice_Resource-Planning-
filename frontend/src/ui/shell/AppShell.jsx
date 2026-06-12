import { useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { T } from '../tokens';
import ModuleBar from './ModuleBar';
import LiveTree from './LiveTree';
import StatusBar from './StatusBar';

const TREE_KEY = 'tig.treeOpen';

export default function AppShell({
  // Same interface as the old Shell:
  activeModule, onNavigate, adminMode, onAdminToggle, currentUser,
  badges, onNewJob, searchValue, onSearchChange, notifCount,
  // New:
  jobs, pinnedJobs, onOpenJob, onUnpinJob,
  children,
}) {
  const [treeOpen, setTreeOpen] = useState(() => localStorage.getItem(TREE_KEY) !== '0');

  const toggleTree = () => setTreeOpen(open => {
    localStorage.setItem(TREE_KEY, open ? '0' : '1');
    return !open;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: T.page, fontFamily: T.font }}>
      <ModuleBar
        activeModule={activeModule}
        onNavigate={onNavigate}
        adminMode={adminMode}
        onAdminToggle={onAdminToggle}
        currentUser={currentUser}
        badges={badges}
        onNewJob={onNewJob}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        notifCount={notifCount}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {treeOpen && (
          <LiveTree
            jobs={jobs}
            pinnedJobs={pinnedJobs}
            currentUser={currentUser}
            onOpenJob={onOpenJob}
            onUnpinJob={onUnpinJob}
            onSelectList={() => onNavigate('jobs')}
          />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          <div
            role="button"
            tabIndex={0}
            aria-label={treeOpen ? 'Collapse tree' : 'Expand tree'}
            title={treeOpen ? 'Collapse tree' : 'Expand tree'}
            onClick={toggleTree}
            onKeyDown={e => { if (e.key === 'Enter') toggleTree(); }}
            style={{
              position: 'absolute', top: 6, left: 6, zIndex: 20,
              width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: T.textFaint,
              background: T.page, border: `1px solid ${T.hairline}`,
            }}
          >
            <PanelLeft size={13} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
            {children}
          </div>
        </div>
      </div>
      <StatusBar currentUser={currentUser} />
    </div>
  );
}
