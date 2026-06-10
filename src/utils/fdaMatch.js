// Match-confidence scoring for FDA results (Couch Mode Phase 3).
//
// openFDA queries are loose name-token searches, so a result list can contain
// similarly-named strangers. These helpers grade each result against the
// prospect so the UI can badge "Strong match" / "Possible" / "Different
// company?" and gate the confirm bar. Pure functions — no React, no fetch —
// so behavior is verifiable with plain node.
//
// Grading rules (see scoreFdaCandidate):
//   - Exact normalized name match → strong (state mismatch noted but does NOT
//     downgrade — multi-site companies legitimately register in other states)
//   - Prefix/containment or meaningful token overlap → strong when the result
//     state matches the prospect's, possible with no location info, weak when
//     states conflict
//   - No real name overlap → weak, even on a state match

// Trailing legal-entity tokens stripped during normalization (repeatedly, so
// "X-Cell Tool & Mold, Inc." and "Foo Holdings LLC" both reduce cleanly).
const LEGAL_SUFFIXES = new Set([
  'inc', 'incorporated', 'llc', 'corp', 'corporation', 'co', 'company',
  'companies', 'ltd', 'limited', 'lp', 'llp', 'pllc', 'plc', 'gmbh', 'sa',
  'srl', 'bv', 'ag', 'pty', 'usa', 'holdings',
])

// Industry-generic tokens that two unrelated plastics companies often share —
// overlap on these alone proves nothing.
const GENERIC_TOKENS = new Set([
  'plastic', 'plastics', 'tool', 'tooling', 'tools', 'mold', 'molding',
  'molded', 'moulding', 'manufacturing', 'mfg', 'industries', 'industrial',
  'products', 'precision', 'technologies', 'technology', 'engineering',
  'solutions', 'systems', 'group', 'medical', 'device', 'devices', 'and',
  'of', 'the',
])

export function normalizeCompanyName(name) {
  if (!name) return ''
  let s = String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (s.startsWith('the ')) s = s.slice(4)
  const tokens = s.split(' ').filter(Boolean)
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop()
  }
  return tokens.join(' ')
}

function meaningfulTokens(normalized) {
  return normalized.split(' ').filter(t => t && !GENERIC_TOKENS.has(t))
}

// 3 = exact, 2 = prefix/containment or distinctive token overlap, 0 = no match
function nameScore(candidateNorm, resultNorm) {
  if (!candidateNorm || !resultNorm) return 0
  if (candidateNorm === resultNorm) return 3
  if (candidateNorm.length >= 5 && resultNorm.length >= 5) {
    if (resultNorm.startsWith(candidateNorm) || candidateNorm.startsWith(resultNorm)) return 2
  }
  const a = meaningfulTokens(candidateNorm)
  const b = meaningfulTokens(resultNorm)
  if (a.length === 0 || b.length === 0) return 0
  const bSet = new Set(b)
  const shared = a.filter(t => bSet.has(t))
  // Require a distinctive (length >= 4) shared token and majority overlap on
  // the shorter name — "Erie Molded Plastics" vs "Erie Plastics" matches,
  // "Venture Plastics" vs "Adventure Plastics" does not.
  if (shared.some(t => t.length >= 4) && shared.length / Math.min(a.length, b.length) >= 0.6) return 2
  return 0
}

/**
 * Grade one FDA result against the prospect.
 * @param {Object} opts
 * @param {string} opts.resultName   applicant / firm name from the FDA record
 * @param {string} [opts.resultState] 2-letter state on the FDA record, if any
 * @param {string[]} opts.candidateNames company + aka + parent + former names (+ manual retries)
 * @param {string} [opts.prospectState] prospect's 2-letter state
 * @returns {{ level: 'strong'|'possible'|'weak', reasons: string[] }}
 */
export function scoreFdaCandidate({ resultName, resultState, candidateNames, prospectState }) {
  const resultNorm = normalizeCompanyName(resultName)
  let best = 0
  let bestCandidate = null
  for (const cand of candidateNames || []) {
    const score = nameScore(normalizeCompanyName(cand), resultNorm)
    if (score > best) {
      best = score
      bestCandidate = cand
    }
  }

  const rState = (resultState || '').trim().toUpperCase()
  const pState = (prospectState || '').trim().toUpperCase()
  const stateKnown = rState && pState
  const stateMatch = stateKnown && rState === pState

  const reasons = []
  let level
  if (best === 3) {
    level = 'strong'
    reasons.push(`name matches "${bestCandidate}"`)
    if (stateKnown) reasons.push(stateMatch ? `${rState} matches` : `${rState} — different state (could be another site)`)
  } else if (best === 2) {
    reasons.push(`name similar to "${bestCandidate}"`)
    if (stateMatch) {
      level = 'strong'
      reasons.push(`${rState} matches`)
    } else if (stateKnown) {
      level = 'weak'
      reasons.push(`${rState} ≠ ${pState}`)
    } else {
      level = 'possible'
      reasons.push('no location to cross-check')
    }
  } else {
    level = 'weak'
    reasons.push('name does not line up')
    if (stateMatch) reasons.push(`${rState} matches, but same-state strangers are common`)
  }
  return { level, reasons }
}

// Sort helper: strong first, then possible, then weak.
export const MATCH_LEVEL_ORDER = { strong: 0, possible: 1, weak: 2 }
