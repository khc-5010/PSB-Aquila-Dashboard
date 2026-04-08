// Shared manufacturing corridor constants
// Single source of truth — imported by GeographyMap, USMap, NationalMap, MapLegend, StateTooltip

export const CORRIDOR_COLORS = {
  'Great Lakes Auto':       '#041E42',
  'Northeast Tool':         '#2563EB',
  'Southeast Growth':       '#16A34A',
  'Gulf / Resin Belt':      '#DC2626',
  'Upper Midwest Medical':  '#7C3AED',
  'West Coast':             '#F59E0B',
  'Mountain / Central':     '#6B7280',
  'Non-Contiguous':         '#9CA3AF',
  'Unknown':                '#D1D5DB',
}

export const STATE_TO_CORRIDOR = {
  MI: 'Great Lakes Auto', OH: 'Great Lakes Auto', IN: 'Great Lakes Auto', IL: 'Great Lakes Auto', WI: 'Great Lakes Auto',
  PA: 'Northeast Tool', NY: 'Northeast Tool', CT: 'Northeast Tool', NJ: 'Northeast Tool', MA: 'Northeast Tool',
  NH: 'Northeast Tool', VT: 'Northeast Tool', ME: 'Northeast Tool', RI: 'Northeast Tool', DC: 'Northeast Tool',
  NC: 'Southeast Growth', GA: 'Southeast Growth', FL: 'Southeast Growth', TN: 'Southeast Growth', SC: 'Southeast Growth',
  VA: 'Southeast Growth', AL: 'Southeast Growth', MS: 'Southeast Growth', KY: 'Southeast Growth',
  TX: 'Gulf / Resin Belt', LA: 'Gulf / Resin Belt', OK: 'Gulf / Resin Belt', AR: 'Gulf / Resin Belt',
  MN: 'Upper Midwest Medical',
  CA: 'West Coast', OR: 'West Coast', WA: 'West Coast',
  CO: 'Mountain / Central', AZ: 'Mountain / Central', UT: 'Mountain / Central', NV: 'Mountain / Central',
  NM: 'Mountain / Central', ID: 'Mountain / Central', MT: 'Mountain / Central', WY: 'Mountain / Central',
  ND: 'Mountain / Central', SD: 'Mountain / Central', NE: 'Mountain / Central', KS: 'Mountain / Central',
  IA: 'Mountain / Central', MO: 'Mountain / Central',
  AK: 'Non-Contiguous', HI: 'Non-Contiguous',
}
