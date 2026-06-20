import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../api';
import { T } from '../../ui/tokens';
import FieldConfig from './FieldConfig';
import StatusWorkflow from './StatusWorkflow';
import PriceLevels from './PriceLevels';
import DecorationTypes from './DecorationTypes';
import MigrationWizard from './MigrationWizard';

const TABS = [
  { id: 'fields',      label: 'Job Fields' },
  { id: 'statuses',    label: 'Status Workflow' },
  { id: 'prices',      label: 'Price Levels' },
  { id: 'decorations', label: 'Decoration Types' },
  { id: 'migration',   label: 'Jim2 Migration' },
];

function useAdminSetting(key) {
  return useQuery({
    queryKey: ['admin-setting', key],
    queryFn: () => api.adminSettings.get(key),
    staleTime: 60_000,
  });
}

function parseJson(raw, fallback = null) {
  try { return raw?.value ? JSON.parse(raw.value) : null; } catch { return fallback; }
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('fields');
  const queryClient = useQueryClient();

  const fieldQuery = useAdminSetting('field_config');
  const statusQuery = useAdminSetting('status_config');
  const priceQuery = useAdminSetting('price_levels');
  const decQuery = useAdminSetting('dec_types');

  function saveKey(key) {
    return async (value) => {
      try {
        await api.adminSettings.set(key, value);
        queryClient.invalidateQueries({ queryKey: ['admin-setting', key] });
      } catch (err) {
        console.error(`Failed to save admin setting: ${key}`, err);
      }
    };
  }

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
        {activeTab === 'fields' && !fieldQuery.isLoading && (
          <FieldConfig config={parseJson(fieldQuery.data)} onChange={saveKey('field_config')} />
        )}
        {activeTab === 'statuses' && !statusQuery.isLoading && (
          <StatusWorkflow config={parseJson(statusQuery.data)} onChange={saveKey('status_config')} />
        )}
        {activeTab === 'prices' && !priceQuery.isLoading && (
          <PriceLevels config={parseJson(priceQuery.data)} onChange={saveKey('price_levels')} />
        )}
        {activeTab === 'decorations' && !decQuery.isLoading && (
          <DecorationTypes config={parseJson(decQuery.data)} onChange={saveKey('dec_types')} />
        )}
        {activeTab === 'migration' && <MigrationWizard />}
      </div>
    </div>
  );
}
