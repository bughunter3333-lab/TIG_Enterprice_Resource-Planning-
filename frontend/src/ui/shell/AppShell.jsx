import { useState } from 'react';
import { T } from '../tokens';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import LiveTree from './LiveTree';
import StatusBar from './StatusBar';
import { MODULE_TITLES } from './pageActions';

const SIDEBAR_KEY = 'tig.treeOpen';

function pageTitle(activeModule, adminMode) {
  if (adminMode) return 'Admin';
  if (activeModule === 'warehouse') return 'Stock · Warehouse';
  return MODULE_TITLES[activeModule] ?? '';
}

/**
 * The app's frame: the sidebar (modules, open jobs and lists, who is signed
 * in) at the left, and on the right the top bar, the page, and the status line.
 */
export default function AppShell({
  // Same interface as the old Shell:
  activeModule, onNavigate, adminMode, onAdminToggle, currentUser,
  badges, onNewJob, searchValue, onSearchChange, notifCount,
  // New:
  jobs, pinnedJobs, onOpenJob, onUnpinJob, onSelectList,
  savedLists, onRunList, onDeleteList,
  savedStockLists, onRunStockList, onDeleteStockList, onOpenStock,
  savedQuoteLists, onRunQuoteList, onDeleteQuoteList,
  savedPOLists, onRunPOList, onDeletePOList, onOpenPO,
  children,
}) {
  // Remembered per person in this browser. The key predates the sidebar (it
  // was the nav tree's), so a person who had folded the tree away keeps the
  // sidebar folded.
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) !== '0'; } catch { return true; }
  });
  const toggle = () => setOpen((was) => {
    try { localStorage.setItem(SIDEBAR_KEY, was ? '0' : '1'); } catch { /* storage blocked — session-only */ }
    return !was;
  });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: T.page, fontFamily: T.font }}>
      <Sidebar
        activeModule={activeModule}
        onNavigate={onNavigate}
        adminMode={adminMode}
        badges={badges}
        currentUser={currentUser}
        collapsed={!open}
        onToggleCollapsed={toggle}
      >
        <LiveTree
          jobs={jobs}
          pinnedJobs={pinnedJobs}
          currentUser={currentUser}
          onOpenJob={onOpenJob}
          onUnpinJob={onUnpinJob}
          onSelectList={onSelectList ?? (() => onNavigate('jobs'))}
          savedLists={savedLists}
          onRunList={onRunList}
          onDeleteList={onDeleteList}
          savedStockLists={savedStockLists}
          onRunStockList={onRunStockList}
          onDeleteStockList={onDeleteStockList}
          onOpenStock={onOpenStock}
          savedQuoteLists={savedQuoteLists}
          onRunQuoteList={onRunQuoteList}
          onDeleteQuoteList={onDeleteQuoteList}
          savedPOLists={savedPOLists}
          onRunPOList={onRunPOList}
          onDeletePOList={onDeletePOList}
          onOpenPO={onOpenPO}
        />
      </Sidebar>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar
          title={pageTitle(activeModule, adminMode)}
          adminMode={adminMode}
          onAdminToggle={onAdminToggle}
          currentUser={currentUser}
          onNewJob={onNewJob}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          notifCount={notifCount}
        />
        <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 28px' }}>
          {children}
        </main>
        <StatusBar currentUser={currentUser} />
      </div>
    </div>
  );
}
