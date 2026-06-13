import { useState } from 'react';
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
  jobs, pinnedJobs, onOpenJob, onUnpinJob, onSelectList,
  children,
}) {
  const [treeOpen, setTreeOpen] = useState(() => {
    try { return localStorage.getItem(TREE_KEY) !== '0'; } catch { return true; }
  });

  const toggleTree = () => setTreeOpen(open => {
    try { localStorage.setItem(TREE_KEY, open ? '0' : '1'); } catch { /* storage blocked — session-only */ }
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
        treeOpen={treeOpen}
        onToggleTree={toggleTree}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {treeOpen && (
          <LiveTree
            jobs={jobs}
            pinnedJobs={pinnedJobs}
            currentUser={currentUser}
            onOpenJob={onOpenJob}
            onUnpinJob={onUnpinJob}
            onSelectList={onSelectList ?? (() => onNavigate('jobs'))}
          />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
            {children}
          </div>
        </div>
      </div>
      <StatusBar currentUser={currentUser} />
    </div>
  );
}
