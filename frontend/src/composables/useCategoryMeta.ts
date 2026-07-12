// Shared menu-item category metadata, used by InsightsView, the cashier
// DashboardView, and the school-admin AnalyticsView so the color/label maps
// don't drift out of sync across three separate copies.
//
// Fixed categorical order + colors (dataviz-skill validated: CVD-safe
// adjacent pairs, contrast relief covered by always-visible direct labels).
// "other" is a real category (non-food shops, e.g. Book Store/Stationery
// items) so it gets its own slot; "uncategorized" is a transaction with no
// menu item at all, so it stays a neutral gray rather than a categorical slot.
export const CATEGORY_ORDER = ['junk', 'healthy', 'beverage', 'snack', 'meal', 'other'];

export const CATEGORY_COLORS: Record<string, string> = {
  junk: '#2a78d6',
  healthy: '#1baf7a',
  beverage: '#eda100',
  snack: '#008300',
  meal: '#4a3aa7',
  other: '#e34948',
  uncategorized: '#9a9a94',
};

export const CATEGORY_LABELS: Record<string, string> = {
  junk: 'Junk Food',
  healthy: 'Healthy',
  beverage: 'Beverage',
  snack: 'Snack',
  meal: 'Meal',
  other: 'Other',
  uncategorized: 'Uncategorized',
};

export function colorFor(cat: string) { return CATEGORY_COLORS[cat] || CATEGORY_COLORS.uncategorized; }
export function labelFor(cat: string) { return CATEGORY_LABELS[cat] || cat; }
