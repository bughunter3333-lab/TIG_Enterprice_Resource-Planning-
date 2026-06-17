import { useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import CardFileList from './CardFileList';
import { filterCardFiles, cardFileGroups } from './cardFileFilters';

export default function CardFilesModule({
  cardFiles = [], search, group, onSearchChange, onGroupChange,
  selectedId, onSelectCard, onNewCard,
}) {
  const groups = useMemo(() => cardFileGroups(cardFiles), [cardFiles]);
  const filtered = useMemo(() => filterCardFiles(cardFiles, search, group), [cardFiles, search, group]);

  const controlStyle = {
    fontSize: T.fsGrid, fontFamily: T.font, color: T.text,
    border: `1px solid ${T.hairline}`, borderRadius: T.radius,
    background: T.panel, height: 28, padding: '0 8px',
  };

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: '4px 8px', flex: 1, maxWidth: 280 }}>
          <Search size={12} color={T.textFaint} />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search card files…"
            style={{ border: 'none', outline: 'none', fontSize: T.fsGrid, width: '100%', fontFamily: T.font, color: T.text }}
          />
        </div>
        <select
          aria-label="Filter by group"
          value={group}
          onChange={e => onGroupChange(e.target.value)}
          style={controlStyle}
        >
          <option value="all">All Groups</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: T.fsSmall, color: T.textMuted }}>{filtered.length} of {cardFiles.length}</span>
        <Button size="sm" variant="primary" onClick={onNewCard}><Plus size={12} /> New Card File</Button>
      </div>

      <CardFileList cards={filtered} selectedId={selectedId} onSelect={onSelectCard} />
    </div>
  );
}
