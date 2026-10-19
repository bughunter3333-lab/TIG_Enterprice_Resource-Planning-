import { useState } from 'react';
import Tabs from '../../ui/Tabs';
import { T } from '../../ui/tokens';
import AccountsPayableModule from '../AccountsPayableModule';
import JournalsTab from './JournalsTab';
import ChartTab from './ChartTab';
import ReportsTab from './ReportsTab';
import SetupTab from './SetupTab';
import { CAN_READ_LEDGER } from './accountingFormat';

/**
 * Accounts: payables, and the general ledger underneath everything.
 *
 * Staff enter and pay bills here, as they always have. The ledger — journals,
 * the chart, the statements — is for admins and managers, because a profit and
 * loss with wages in it is not for every account. The server enforces that;
 * the tabs follow it so nobody is shown a screen that will only refuse them.
 */

const LEDGER_TABS = [
  { id: 'reports', label: 'Reports' },
  { id: 'journals', label: 'Journals' },
  { id: 'chart', label: 'Chart of Accounts' },
  { id: 'setup', label: 'Ledger Health' },
];

export default function AccountingModule({ suppliers = [], currentUser }) {
  const canRead = CAN_READ_LEDGER.includes(currentUser?.role);
  const tabs = [{ id: 'payables', label: 'Payables' }, ...(canRead ? LEDGER_TABS : [])];
  const [tab, setTab] = useState(canRead ? 'reports' : 'payables');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: T.font }}>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 12 }}>
        {tab === 'payables' && <AccountsPayableModule suppliers={suppliers} />}
        {tab === 'reports' && canRead && <ReportsTab />}
        {tab === 'journals' && canRead && <JournalsTab currentUser={currentUser} />}
        {tab === 'chart' && canRead && <ChartTab currentUser={currentUser} />}
        {tab === 'setup' && canRead && <SetupTab currentUser={currentUser} />}
      </div>
    </div>
  );
}
