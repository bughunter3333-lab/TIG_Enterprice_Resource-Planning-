import Rail from './Rail';
import LabelPanel from './LabelPanel';
import Topbar from './Topbar';

const MODULE_TITLES = {
  dashboard:    { title: 'Dashboard',       subtitle: 'Total Image Group' },
  jobs:         { title: 'Jobs',             subtitle: 'All production jobs' },
  quotes:       { title: 'Quotes',           subtitle: 'Active quotes' },
  purchases:    { title: 'Purchase Orders',  subtitle: 'Supplier orders' },
  customers:    { title: 'Customers',        subtitle: 'Card files' },
  inventory:    { title: 'Stock',            subtitle: 'Inventory' },
  accounts:     { title: 'Accounts',         subtitle: 'Financial records' },
  reports:      { title: 'Reports',          subtitle: '' },
  'card-files': { title: 'Card Files',       subtitle: '' },
};

export default function Shell({
  activeModule,
  onNavigate,
  adminMode,
  onAdminToggle,
  currentUser,
  badges,
  onNewJob,
  searchValue,
  onSearchChange,
  notifCount,
  children,
}) {
  const { title, subtitle } = MODULE_TITLES[activeModule] ?? { title: activeModule, subtitle: '' };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f1f5f9' }}>
      <Rail
        activeModule={activeModule}
        onNavigate={onNavigate}
        adminMode={adminMode}
        onAdminToggle={onAdminToggle}
        currentUser={currentUser}
      />
      <LabelPanel
        activeModule={activeModule}
        onNavigate={onNavigate}
        adminMode={adminMode}
        onAdminToggle={onAdminToggle}
        currentUser={currentUser}
        badges={badges}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar
          title={adminMode ? 'Admin Tools' : title}
          subtitle={adminMode ? 'Configuration & Migration' : subtitle}
          onNewJob={onNewJob}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          notifCount={notifCount}
        />
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
