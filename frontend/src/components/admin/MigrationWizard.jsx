import { useState } from 'react';
import * as api from '../../api';
import { T } from '../../ui/tokens';

const STEPS = [
  {
    id: 1,
    title: 'Export from Jim2',
    description: 'In Jim2, go to each module and export as CSV:',
    instructions: [
      '1. CardFiles: Jim2 → CardFiles → File → Export → CSV (save as cardfiles.csv)',
      '2. Stock/Items: Jim2 → Stock → Items → File → Export → CSV (save as items.csv)',
      '3. Jobs: Jim2 → Jobs → File → Export → CSV (save as jobs.csv)',
    ],
    upload: null,
  },
  {
    id: 2,
    title: 'Import Card Files',
    description: 'Upload the cardfiles.csv exported from Jim2. Maps to customers and ship-to addresses.',
    upload: { key: 'customers', label: 'cardfiles.csv', handler: (file) => api.importData.customers(file) },
  },
  {
    id: 3,
    title: 'Import Stock / Items',
    description: 'Upload the items.csv. Maps to your inventory catalogue.',
    upload: { key: 'inventory', label: 'items.csv', handler: (file) => api.importData.inventory(file) },
  },
  {
    id: 4,
    title: 'Import Jobs',
    description: 'Upload the jobs.csv. Maps to jobs and job line items.',
    upload: { key: 'jobs', label: 'jobs.csv', handler: (file) => api.importData.jobs(file) },
  },
  {
    id: 5,
    title: 'Validate & Confirm',
    description: 'Review imported row counts and errors below.',
    upload: null,
  },
];

export default function MigrationWizard() {
  const [step, setStep] = useState(1);
  const [results, setResults] = useState({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const currentStep = STEPS.find(s => s.id === step);

  async function handleUpload(e, stepDef) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const result = await stepDef.upload.handler(file);
      setResults(r => ({ ...r, [stepDef.upload.key]: result }));
    } catch (err) {
      setError(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      input.value = '';
    }
  }

  return (
    <div>
      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        {STEPS.map((s, idx) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: idx < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
              background: step > s.id ? T.ok : step === s.id ? T.accentStrong : T.chromeRaised,
              color: step > s.id ? 'white' : step === s.id ? '#1c1404' : T.chromeTextMuted,
              border: `1px solid ${step >= s.id ? 'transparent' : T.chromeHover}`,
            }}>
              {step > s.id ? '✓' : s.id}
            </div>
            {idx < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: step > s.id ? T.ok : T.chromeHover, margin: '0 6px' }} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={{ background: T.chromeRaised, borderRadius: 8, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.accent, marginBottom: 6 }}>{currentStep.title}</div>
        <div style={{ fontSize: 11, color: T.chromeTextMuted, marginBottom: 12 }}>{currentStep.description}</div>

        {currentStep.instructions && (
          <div style={{ background: T.chrome, borderRadius: 6, padding: 12, marginBottom: 12 }}>
            {currentStep.instructions.map((line, i) => (
              <div key={i} style={{ fontSize: 11, color: T.chromeTextMuted, marginBottom: 4 }}>{line}</div>
            ))}
          </div>
        )}

        {currentStep.upload && (
          <div>
            <label style={{ display: 'inline-block', cursor: uploading ? 'not-allowed' : 'pointer' }}>
              <input
                type="file"
                accept=".csv"
                disabled={uploading}
                onChange={e => handleUpload(e, currentStep)}
                style={{ display: 'none' }}
              />
              <div style={{
                padding: '8px 18px',
                background: uploading ? T.chromeHover : T.accentStrong,
                color: uploading ? T.chromeTextMuted : '#1c1404',
                borderRadius: 7, fontSize: 12, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}>
                {uploading ? 'Uploading…' : `Upload ${currentStep.upload.label}`}
              </div>
            </label>

            {results[currentStep.upload.key] && (
              <div style={{ marginTop: 8, fontSize: 11, color: T.ok }}>
                ✓ Imported: {results[currentStep.upload.key].imported ?? '?'} rows
                {(results[currentStep.upload.key].errors?.length ?? 0) > 0 && (
                  <span style={{ color: T.accent, marginLeft: 8 }}>
                    {results[currentStep.upload.key].errors.length} warnings
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 5 summary */}
        {step === 5 && (
          <div>
            {['customers', 'inventory', 'jobs'].map(key => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${T.chromeHover}` }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: results[key] ? T.ok : T.chromeHover }} />
                <span style={{ fontSize: 12, color: T.chromeText, flex: 1, textTransform: 'capitalize' }}>{key}</span>
                <span style={{ fontSize: 11, color: results[key] ? T.ok : T.chromeTextMuted }}>
                  {results[key] ? `${results[key].imported ?? 0} rows imported` : 'Not imported'}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: T.danger }}>⚠ {error}</div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button
          onClick={() => setStep(s => Math.max(1, s - 1))}
          disabled={step === 1}
          style={{
            padding: '6px 16px', borderRadius: 6, border: `1px solid ${T.chromeHover}`,
            background: 'transparent', color: step === 1 ? T.chromeHover : T.chromeTextMuted,
            fontSize: 11, cursor: step === 1 ? 'not-allowed' : 'pointer',
          }}
        >
          ← Back
        </button>
        <button
          onClick={() => setStep(s => Math.min(5, s + 1))}
          disabled={step === 5}
          style={{
            padding: '6px 16px', borderRadius: 6, border: 'none',
            background: step === 5 ? T.chromeHover : T.accentStrong,
            color: step === 5 ? T.chromeTextMuted : '#1c1404',
            fontSize: 11, fontWeight: 600, cursor: step === 5 ? 'not-allowed' : 'pointer',
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
