import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../api';
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

  const { data: fieldSettingRaw } = useAdminSetting('field_config');
  const { data: statusSettingRaw } = useAdminSetting('status_config');
  const { data: priceSettingRaw } = useAdminSetting('price_levels');
  const { data: decSettingRaw } = useAdminSetting('dec_types');

  async function saveKey(key) {
    return async (value) => {
      await api.adminSettings.set(key, value);
      queryClient.invalidateQueries({ queryKey: ['admin-setting', key] });
    };
  }

  return (
    <div style={{ background: '#0f172a', minHeight: '100%', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24' }}>Admin Tools</div>
        <div style={{ fontSize: 11, color: '#475569' }}>System configuration · Admin only</div>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #1e293b', marginBottom: 20 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #f59e0b' : '2px solid transparent',
              background: 'transparent', color: activeTab === tab.id ? '#fbbf24' : '#64748b',
              borderRadius: '4px 4px 0 0',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'fields' && (
          <FieldConfig config={parseJson(fieldSettingRaw)} onChange={saveKey('field_config')} />
        )}
        {activeTab === 'statuses' && (
          <StatusWorkflow config={parseJson(statusSettingRaw)} onChange={saveKey('status_config')} />
        )}
        {activeTab === 'prices' && (
          <PriceLevels config={parseJson(priceSettingRaw)} onChange={saveKey('price_levels')} />
        )}
        {activeTab === 'decorations' && (
          <DecorationTypes config={parseJson(decSettingRaw)} onChange={v => saveKey('dec_types')(v)} />
        )}
        {activeTab === 'migration' && <MigrationWizard />}
      </div>
    </div>
  );
}
