import { Rows3, Rows4 } from 'lucide-react';
import SegmentedControl from './SegmentedControl';
import { useDensity } from '../lib/useDensity';

/** The Compact / Comfortable switch for work grids; remembered per person. */
export default function DensityToggle() {
  const [density, setDensity] = useDensity();
  return (
    <SegmentedControl
      label="Row density"
      size="sm"
      value={density}
      onChange={setDensity}
      options={[
        { value: 'compact', label: 'Compact', icon: Rows4 },
        { value: 'comfortable', label: 'Comfortable', icon: Rows3 },
      ]}
    />
  );
}
