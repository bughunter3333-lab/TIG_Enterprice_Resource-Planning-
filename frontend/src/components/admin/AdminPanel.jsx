import { useState } from 'react';
import { T } from '../../ui/tokens';
import MigrationWizard from './MigrationWizard';
import DocumentDesigner from '../../modules/documents/DocumentDesigner';
import UsersModule from '../../modules/users/UsersModule';
import SettingsModule from '../../modules/SettingsModule';
import CrashReportsModule from '../../modules/crash-reports/CrashReportsModule';
import StatusTimesSettings from '../../modules/jobs/StatusTimesSettings';

const TABS = [
  { id: 'users',       label: 'Users and roles' },
  // Company details, bank, email server and EFTPOS: printed on every invoice.
  { id: 'company',     label: 'Company Settings' },
  // Job Fields, Status Workflow, Price Levels and Decoration Types are not
  // offered: each saved a setting nothing in the app reads (field_config,
  // status_config, price_levels, dec_types — the job form reads
  // custom_dec_types), so an admin's change said "saved" and did nothing.
  // Their components stay (FieldConfig, StatusWorkflow, PriceLevels,
  // DecorationTypes) and return as each is wired: the statuses with the
  // strict workflow, job fields with configurable fields, price levels with a
  // customer's default level (docs/superpowers/specs/2026-11-06-jim2-parity-roadmap.md).
  // How long a job may sit at each status (docs/superpowers/specs/2026-11-09-status-times.md).
  { id: 'status-times', label: 'Status times' },
  { id: 'documents',   label: 'Print Templates' },
  { id: 'migration',   label: 'Jim2 Migration' },
  // What broke, for whom, with what they saw (docs/superpowers/specs/2026-11-08-crash-reports.md).
  { id: 'crash-reports', label: 'Crash reports' },
];

// `usersFilter` is handed to Users and roles as its opening filter (UsersModule `initialFilter`).
export default function AdminPanel({ currentUser, usersFilter }) {
  // Who can sign in, and as what, is the first thing an admin comes here for.
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div style={{ background: T.chrome, minHeight: '100%', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>Admin Tools</div>
        <div style={{ fontSize: 11, color: T.chromeTextMuted }}>System configuration · Admin only</div>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${T.chromeRaised}`, marginBottom: 20 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
              borderBottom: activeTab === tab.id ? `2px solid ${T.accentStrong}` : '2px solid transparent',
              background: 'transparent', color: activeTab === tab.id ? T.accent : T.chromeTextMuted,
              borderRadius: '4px 4px 0 0',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'users' && <UsersModule currentUser={currentUser} initialFilter={usersFilter} />}
        {activeTab === 'company' && <SettingsModule currentUser={currentUser} />}
        {activeTab === 'status-times' && <StatusTimesSettings />}
        {activeTab === 'documents' && <DocumentDesigner />}
        {activeTab === 'migration' && <MigrationWizard />}
        {activeTab === 'crash-reports' && <CrashReportsModule />}
      </div>
    </div>
  );
}
