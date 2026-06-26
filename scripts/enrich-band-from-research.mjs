#!/usr/bin/env node
/**
 * Apply web-researched data fills to the 55-company "score-mover" band (scored,
 * non-exempt prospects with priority_score >= 40 that had a researchable gap).
 *
 * The values below were gathered by a fan-out of 78 read-only research agents
 * (one per company), each required to confirm company identity and cite a source
 * for every value — nothing is fabricated. Each fill carries its confidence +
 * source URL inline (high/medium only; low-confidence findings, two value
 * conflicts vs. the validation run, all medical="No" except one high-confidence
 * case, plus Minnesota R&P's score-lowering press count and Forj's suspicious
 * 2025 "founding" were HELD OUT for human review and are NOT in this file).
 *
 * For each company it: applies the researched fields, derives years_in_business
 * from year_founded when previously null, and recomputes priority_score /
 * ai_readiness via the canonical scorer (src/utils/priorityScore.js) WITHOUT
 * touching updated_at, preserving any priority_manual override. Idempotent;
 * dry-run by default.
 *
 *   node scripts/enrich-band-from-research.mjs            # dry-run
 *   node scripts/enrich-band-from-research.mjs --apply    # write
 *
 * Requires DATABASE_URL. NOTE: raw column writes do not fire the app's Layer-1
 * ontology rebuild (key_certifications / rjg / medical / ownership are ontology
 * inputs) — the graph reconciles on the next bulk import or ontology PATCH.
 */
import { neon } from '@neondatabase/serverless'
import { calculatePriorityScore, getTierFromScore, calculateAiReadiness, isExempt } from '../src/utils/priorityScore.js'

const APPLY = process.argv.includes('--apply')
const CURRENT_YEAR = 2026
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1) }
const sql = neon(process.env.DATABASE_URL)

// { id, set: <researched fields>, sources: <confidence + URL per field, for the record> }
const ENRICH = [
  { id: 372, set: { rjg_cavity_pressure: 'Yes' }, sources: { rjg_cavity_pressure: 'medium: weiss-aug.com/insert-molding-2/' } },
  { id: 13,  set: { press_count: 260, rjg_cavity_pressure: 'Yes' }, sources: { press_count: 'high: plasticsnews.com (MGS $20M WI clean-room)', rjg_cavity_pressure: 'medium: plasticstoday.com MGS part-ii' } },
  { id: 402, set: { year_founded: 1973 }, sources: { year_founded: 'high: dnb.com DeRoyal Industries' } },
  { id: 666, set: { year_founded: 1949 }, sources: { year_founded: 'high: zippia.com plastics-one history' } },
  { id: 289, set: { year_founded: 1947, press_count: 155 }, sources: { year_founded: 'high: tpmmfg.com/about', press_count: 'high: tpmmfg.com/about' } },
  { id: 737, set: { year_founded: 1940 }, sources: { year_founded: 'medium: industrynet.com commercial-plastics-nebraska' } },
  { id: 288, set: { year_founded: 1967 }, sources: { year_founded: 'high: dupont.com (acquire Donatelle)' } },
  { id: 698, set: { year_founded: 1949 }, sources: { year_founded: 'medium: laitram.com + ZoomInfo (parent Laitram Corp; Intralox division est. 1971)' } },
  { id: 95,  set: { press_count: 65 }, sources: { press_count: 'high: sussexim.com facilities-and-locations' } },
  { id: 36,  set: { employees_approx: 750 }, sources: { employees_approx: 'medium: LinkedIn/aggregator consensus 501-1000 midpoint (post-divestiture)' } },
  { id: 637, set: { year_founded: 1953 }, sources: { year_founded: 'high: ptaplastics.com/about' } },
  { id: 679, set: { year_founded: 1974, key_certifications: 'ISO 9001, ISO 14001' }, sources: { year_founded: 'high: vedp.org case-study/stihl', key_certifications: 'high: stihlusa.com iso-9001-and-14001' } },
  { id: 381, set: { press_count: 180 }, sources: { press_count: 'high: plasticsengineering.org (COMAR Wittmann work-cells)' } },
  { id: 46,  set: { press_count: 65 }, sources: { press_count: 'medium: manarinc.com custom-plastic-injection-molded-parts' } },
  { id: 283, set: { year_founded: 1972 }, sources: { year_founded: 'medium: velosity.com + ZoomInfo/LinkedIn (Teamvantage est. 1972)' } },
  { id: 30,  set: { press_count: 100 }, sources: { press_count: 'medium: wiseplastics.com/industries/automotive' } },
  { id: 571, set: { year_founded: 1994 }, sources: { year_founded: 'medium: epcmfg.com/about' } },
  { id: 291, set: { year_founded: 1989 }, sources: { year_founded: 'high: zoominfo.com promed-molded-products' } },
  { id: 619, set: { year_founded: 1982 }, sources: { year_founded: 'high: thomasnet.com ark-plas-products' } },
  { id: 119, set: { employees_approx: 1174, medical_device_mfg: 'Yes' }, sources: { employees_approx: 'medium: zoominfo.com nyx-inc', medical_device_mfg: 'medium: nyxinc.com page_id=241' } },
  { id: 723, set: { year_founded: 1982, key_certifications: 'ISO 9001', rjg_cavity_pressure: 'Likely' }, sources: { year_founded: 'medium: laconiadailysun.com (GI Plastek -> PSI)', key_certifications: 'high: psimp.com/quality', rjg_cavity_pressure: 'medium: psimp.com/quality' } },
  { id: 670, set: { year_founded: 1985 }, sources: { year_founded: 'high: hamptonroadsalliance.com (Canon VA expand)' } },
  { id: 680, set: { year_founded: 1976, press_count: 36 }, sources: { year_founded: 'high: bbb.org altek-inc liberty-lake', press_count: 'medium: mfg.com altek-inc' } },
  { id: 467, set: { year_founded: 2019 }, sources: { year_founded: 'medium: careers.arthrex.com Locations' } },
  { id: 594, set: { year_founded: 1994 }, sources: { year_founded: 'medium: biomerics.com/about-us/history2' } },
  { id: 332, set: { press_count: 26 }, sources: { press_count: 'medium: slideshare.net dixien-llc-plastics-2016' } },
  { id: 70,  set: { press_count: 150, medical_device_mfg: 'Yes', rjg_cavity_pressure: 'Yes (confirmed)' }, sources: { press_count: 'medium: flambeau.com/capabilities/injection-molding', medical_device_mfg: 'high: flambeau.com/markets/medical-healthcare', rjg_cavity_pressure: 'high: flambeau.com/capabilities/injection-molding' } },
  { id: 721, set: { year_founded: 1969 }, sources: { year_founded: 'high: granitestateplastics.com/about-gsp' } },
  { id: 27,  set: { press_count: 40, rjg_cavity_pressure: 'Likely' }, sources: { press_count: 'medium: plasticsnews.com (Nolato Contour adds 3 presses)', rjg_cavity_pressure: 'medium: nolato.com careers usa programs' } },
  { id: 313, set: { year_founded: 1958, press_count: 60, rjg_cavity_pressure: 'Yes (confirmed)' }, sources: { year_founded: 'high: plasticstoday.com Spectrum 50th', press_count: 'medium: spectrumplastics.com minneapolis-mn', rjg_cavity_pressure: 'high: prnewswire.com Spectrum cleanroom expansion' } },
  { id: 254, set: { year_founded: 1947 }, sources: { year_founded: 'high: allianceppc.com/about-us' } },
  { id: 246, set: { year_founded: 1920 }, sources: { year_founded: 'high: mack.com/company/history' } },
  { id: 928, set: { rjg_cavity_pressure: 'Yes' }, sources: { rjg_cavity_pressure: 'high: phillipsmedisize.com new-richmond-wisconsin' } },
  { id: 129, set: { employees_approx: 125 }, sources: { employees_approx: 'medium: linkedin.com/company/team-1-plastics' } },
  { id: 192, set: { year_founded: 1986 }, sources: { year_founded: 'medium: plasticsnews.com (Westfall buys AMS Plastics)' } },
  { id: 647, set: { year_founded: 1949 }, sources: { year_founded: 'medium: zoominfo.com aptyx' } },
  { id: 286, set: { year_founded: 1984, press_count: 39 }, sources: { year_founded: 'high: dandb.com Donnelly Custom Mfg (Beacon parent)', press_count: 'high: beaconmfggroup.com 2022 MAPP award' } },
  { id: 11,  set: { press_count: 40 }, sources: { press_count: 'medium: ptonline.com (Currier medical consumables blow molding)' } },
  { id: 140, set: { key_certifications: 'ISO 9001', press_count: 55, rjg_cavity_pressure: 'Likely' }, sources: { key_certifications: 'high: deluxeplastics.com quality-management-system', press_count: 'high: deluxeplastics.com facilities/clintonville', rjg_cavity_pressure: 'medium: deluxeplastics.com injection-molding' } },
  { id: 750, set: { year_founded: 1976 }, sources: { year_founded: 'high: gavcoplastics.com/about-us (founded 1976 by Randall Gavlik)' } },
  { id: 200, set: { year_founded: 1984 }, sources: { year_founded: 'high: biospace.com (Freudenberg-NOK acquires Helix Medical)' } },
  { id: 28,  set: { key_certifications: 'ISO 9001', press_count: 12 }, sources: { key_certifications: 'medium: pascotool.com/iso', press_count: 'medium: plasticstoday.com (Pasco expands)' } },
  { id: 593, set: { year_founded: 1981 }, sources: { year_founded: 'high: rosti.com/en-us/locations/rosti-utah' } },
  { id: 186, set: { rjg_cavity_pressure: 'Yes' }, sources: { rjg_cavity_pressure: 'medium: plastikon.com injection-mold-design-tooling' } },
  { id: 296, set: { year_founded: 1965 }, sources: { year_founded: 'high: steinwall.com/facility/history' } },
  { id: 398, set: { year_founded: 1998 }, sources: { year_founded: 'high: injectionmoldingmanufacturers.com baxter-enterprises-llc' } },
  { id: 248, set: { year_founded: 1973 }, sources: { year_founded: 'high: hickoryrecord.com (Sarstedt 50 years in US)' } },
  { id: 97,  set: { press_count: 30 }, sources: { press_count: 'medium: comar.com (acquisition of iMARK Molding)' } },
  { id: 696, set: { year_founded: 1991 }, sources: { year_founded: 'high: opportunitylouisiana.gov (ASH Industries 85-job expansion)' } },
  { id: 301, set: { year_founded: 1977 }, sources: { year_founded: 'high: einpresswire.com (Diversified Plastics -> Aprios rebrand)' } },
  { id: 228, set: { year_founded: 1982, key_certifications: 'IATF 16949, ISO 14001' }, sources: { year_founded: 'medium: plasticsnews.com (Royal Tech buys Hi-Tech)', key_certifications: 'medium: royaltechnologies.com our-locations' } },
  { id: 116, set: { medical_device_mfg: 'No' }, sources: { medical_device_mfg: 'high: zoominfo.com lacks-enterprises (automotive trim, not medical)' } },
  { id: 22,  set: { press_count: 28 }, sources: { press_count: 'medium: plasticstoday.com MRPC Butler WI' } },
  { id: 494, set: { employees_approx: 203, year_founded: 1953, press_count: 41 }, sources: { employees_approx: 'medium: leadiq.com pta-plastics', year_founded: 'high: ptaplastics.com/about', press_count: 'high: ptonline.com (PTA adds six machines)' } },
  { id: 216, set: { employees_approx: 190, year_founded: 1973, key_certifications: 'ISO 9001, ISO 14001, IATF 16949, AS9100', medical_device_mfg: 'Yes' }, sources: { employees_approx: 'medium: pitchbook.com', year_founded: 'high: elpasoinc.com', key_certifications: 'high: plasticmolding.com/quality', medical_device_mfg: 'high: qmed.com plastic-molding-technology' } },
]

function eq(a, b) { return String(a ?? '') === String(b ?? '') }

async function applyRow(e) {
  const [row] = await sql`SELECT * FROM prospect_companies WHERE id = ${e.id}`
  if (!row) { console.log(`  [${e.id}] NOT FOUND — skip`); return { changed: false } }
  const set = { ...e.set }
  const foundedAfter = set.year_founded ?? row.year_founded
  if (foundedAfter != null && row.years_in_business == null) set.years_in_business = CURRENT_YEAR - foundedAfter

  const merged = { ...row, ...set }
  const exempt = isExempt(merged)
  const score = exempt ? null : calculatePriorityScore(merged).score
  const readiness = exempt ? 'exempt' : calculateAiReadiness(merged).readiness
  const tier = exempt ? null : getTierFromScore(score)
  if (!exempt) {
    set.priority_score = score
    set.ai_readiness = readiness
    if (!row.priority_manual) set.priority = tier
  }

  const changes = {}
  for (const [k, v] of Object.entries(set)) if (!eq(row[k], v)) changes[k] = v
  if (Object.keys(changes).length === 0) { console.log(`  [${e.id}] ${row.company}: no-op`); return { changed: false } }

  const scoreNote = (!exempt && row.priority_score !== score) ? `   (score ${row.priority_score}->${score}${row.priority !== tier && !row.priority_manual ? ` ${row.priority}->${tier}` : ''})` : ''
  const fieldList = Object.keys(e.set).join(', ')
  console.log(`  [${e.id}] ${row.company}: ${fieldList}${scoreNote}${row.priority_manual ? ' [MANUAL kept]' : ''}`)
  if (!APPLY) return { changed: true }

  const cols = Object.keys(changes)
  const params = cols.map(c => changes[c]); params.push(e.id)
  await sql.query(`UPDATE prospect_companies SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${params.length}`, params)
  console.log(`     ✓ updated`)
  return { changed: true }
}

console.log(`${APPLY ? '── APPLY ──' : '── DRY-RUN ──'}\n=== Band enrichment (${ENRICH.length} companies) ===`)
let n = 0
for (const e of ENRICH) { const r = await applyRow(e); if (r.changed) n++ }
console.log(`\n${APPLY ? 'Done' : 'Dry-run'}: ${n}/${ENRICH.length} companies with changes.`)
console.log(APPLY ? '' : 'Re-run with --apply to write.')
