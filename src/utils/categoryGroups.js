// Category parent-group rules for collapsing 65+ raw category values into ~12 parent buckets.
// SYNC: Keep in sync with the server-side copy in api/prospects.js
//
// ORDER MATTERS: More specific prefixes MUST come before generic ones.
// e.g., "Converter + In-House Tooling" before "Converter"

export const CATEGORY_PARENT_RULES = [
  // Mold Maker variants
  { prefix: 'Mold Maker + Converter', parent: 'Mold Maker + Converter' },
  { prefix: 'Mold Maker', parent: 'Mold Maker' },
  { prefix: 'Mold/Tool Maker', parent: 'Mold Maker' },
  { prefix: 'Mold/Tool', parent: 'Mold Maker' },
  { prefix: 'Toolmaker + Converter', parent: 'Mold Maker + Converter' },
  { prefix: 'Toolmaker', parent: 'Mold Maker' },
  { prefix: 'Tool & Die', parent: 'Mold Maker' },

  // Converter variants (order matters!)
  { prefix: 'Converter + In-House Tooling', parent: 'Converter + In-House Tooling' },
  { prefix: 'Converter + Mold Maker', parent: 'Mold Maker + Converter' },
  { prefix: 'Converter + Mold Design', parent: 'Mold Maker + Converter' },
  { prefix: 'Captive Converter', parent: 'Captive/OEM' },
  { prefix: 'Captive OEM', parent: 'Captive/OEM' },
  { prefix: 'Captive Molder', parent: 'Captive/OEM' },
  { prefix: 'OEM + Converter', parent: 'Captive/OEM' },
  { prefix: 'OEM + Captive', parent: 'Captive/OEM' },
  { prefix: 'OEM Converter', parent: 'Captive/OEM' },
  { prefix: 'Automotive Tier 1', parent: 'Captive/OEM' },
  { prefix: 'Contract Manufacturer', parent: 'Converter' },
  { prefix: 'Converter', parent: 'Converter' },
  { prefix: 'Micro Injection', parent: 'Converter' },
  { prefix: 'Medical OEM', parent: 'Converter' },

  // Non-converter categories
  { prefix: 'Hot Runner', parent: 'Hot Runner Systems' },
  { prefix: 'Knowledge Sector', parent: 'Knowledge Sector' },
  { prefix: 'Catalog/Standards', parent: 'Catalog/Standards' },
  { prefix: 'Strategic', parent: 'Strategic Partner' },
  { prefix: 'Ecosystem', parent: 'Ecosystem/Channel' },
  { prefix: 'Thermoformer', parent: 'Thermoformer' },
  { prefix: 'Does Not Fit', parent: 'Does Not Fit' },
  { prefix: 'Enterprise', parent: 'Does Not Fit' },
]

export function getParentCategory(category) {
  if (!category) return 'Other'
  for (const rule of CATEGORY_PARENT_RULES) {
    if (category === rule.prefix || category.startsWith(rule.prefix)) {
      return rule.parent
    }
  }
  return 'Other'
}

// Ordered list of parent group names for the filter dropdown
export const PARENT_CATEGORY_OPTIONS = [
  'All',
  'Converter',
  'Converter + In-House Tooling',
  'Mold Maker + Converter',
  'Mold Maker',
  'Captive/OEM',
  'Hot Runner Systems',
  'Knowledge Sector',
  'Catalog/Standards',
  'Strategic Partner',
  'Ecosystem/Channel',
  'Thermoformer',
  'Does Not Fit',
  'Other',
]
