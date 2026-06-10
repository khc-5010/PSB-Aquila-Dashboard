#!/usr/bin/env node
/*
 * verify-export.js — verification for the per-company "Export JSON" feature.
 *
 * Two modes:
 *
 *   node scripts/verify-export.js --mock        (default; no DB / no network)
 *       Runs a Sybridge-shaped fixture through a REFERENCE implementation of the
 *       link-walk + payload shaping that mirrors the server endpoint
 *       (api/prospects.js `action=export-json`). Asserts the corporate-link
 *       behavior and prints the assembled Sybridge payload as a demonstration.
 *       SYNC: keep resolveLinks()/assemblePayload() aligned with the endpoint.
 *
 *   node scripts/verify-export.js --url <baseUrl> --id <prospectId>
 *       Integration check against a deployed instance. Fetches
 *       <baseUrl>/api/prospects?action=export-json&id=<id> and validates the
 *       payload shape. Use this on the Vercel preview once deployed.
 *
 * There is no DATABASE_URL in this container (see tasks/lessons.md), so --mock is
 * the in-environment proof; --url is for live-data confirmation after deploy.
 */

const TYPED_KINDS = ['subsidiary', 'absorbed_into']
const LINKED_CAP = 25
const SCHEMA_VERSION = '1.1' // 1.1: contacts[] populated from prospect_contacts (E5)

// ── Reference implementation (mirror of api/prospects.js export-json) ──────────

function resolveLinks(primary, allRows) {
  const primaryId = Number(primary.id)
  const visited = new Set([primaryId])
  const linked = []
  const add = (row, relationship, link_basis) => {
    const rid = Number(row.id)
    if (visited.has(rid)) return
    visited.add(rid)
    linked.push({ row, relationship, link_basis })
  }
  const norm = (s) => (s == null ? '' : String(s).trim().toLowerCase())

  // 2a. Typed children
  for (const row of allRows) {
    if (Number(row.id) === primaryId) continue
    if (
      norm(row.parent_company) === norm(primary.company) &&
      TYPED_KINDS.includes(row.parent_relationship_kind)
    ) {
      add(row, row.parent_relationship_kind, 'parent_company')
    }
  }
  // 2b. Typed parent
  if (primary.parent_company && TYPED_KINDS.includes(primary.parent_relationship_kind)) {
    const parent = allRows.find(
      (r) => Number(r.id) !== primaryId && norm(r.company) === norm(primary.parent_company)
    )
    if (parent) add(parent, 'parent', 'parent_company')
  }
  // 2c. Former-name rows
  if (Array.isArray(primary.former_names)) {
    const lowered = primary.former_names.filter(Boolean).map(norm)
    for (const row of allRows) {
      if (Number(row.id) === primaryId) continue
      if (lowered.includes(norm(row.company))) add(row, 'former_name', 'former_names')
    }
  }
  return linked.slice(0, LINKED_CAP)
}

function deriveActivityType(text) {
  const t = (text || '').replace(/^\s+/, '')
  if (/^(Task |✓ Task|✗ Task|↺ Task|⌫ Task)/.test(t)) return 'task'
  if (/^⚑/.test(t) || /^✓ Review/.test(t)) return 'flag'
  return 'note'
}

function assemblePayload(primary, allRows, subByPid) {
  const sub = (pid) => {
    const s = subByPid[pid] || {}
    return {
      // Fixture has no contacts; the live endpoint fills this from prospect_contacts (schema 1.1)
      contacts: (s.contacts || []).map((c) => ({
        name: c.name,
        role: c.role || null,
        email: c.email || null,
        phone: c.phone || null,
        notes: c.notes || null,
        source: c.source || null,
        last_contacted: c.last_contacted || null,
        created_by: c.created_by || null,
        created_at: c.created_at,
      })),
      attachments: (s.attachments || []).map((a) => ({
        type: a.attachment_type,
        title: a.title || null,
        body: a.content || '',
        created_at: a.created_at,
        created_by: a.created_by || null,
      })),
      activity_log: (s.activity_log || []).map((e) => ({
        timestamp: e.created_at,
        author: e.created_by || null,
        type: deriveActivityType(e.entry_text),
        entry: e.entry_text || '',
      })),
      tasks: (s.tasks || []).map((t) => ({
        task: t.description,
        assignee: t.assignee || null,
        due_date: t.due_date,
        status: t.status,
        created_by: t.created_by || null,
        created_at: t.created_at,
        completed_at: t.completed_at || null,
        completed_by: t.completed_by || null,
      })),
    }
  }
  const links = resolveLinks(primary, allRows)
  const primarySub = sub(Number(primary.id))
  return {
    generated_at: new Date().toISOString(),
    schema_version: SCHEMA_VERSION,
    company: primary,
    contacts: primarySub.contacts,
    attachments: primarySub.attachments,
    activity_log: primarySub.activity_log,
    tasks: primarySub.tasks,
    linked_entities: links.map(({ row, relationship, link_basis }) => {
      const s = sub(Number(row.id))
      return { relationship, link_basis, company: row, ...s }
    }),
  }
}

// ── Fixture (Sybridge roll-up + standalone) ───────────────────────────────────

const ROWS = [
  {
    id: 1,
    company: 'SyBridge Technologies',
    parent_company: null,
    parent_relationship_kind: null,
    financial_sponsor: 'Crestview Partners',
    // X-Cell appears as a typed child AND here; Pyramid is former-name-only;
    // self-name is included to prove self-exclusion.
    former_names: ['X-Cell Tool & Mold', 'Pyramid Mold', 'SyBridge Technologies'],
    notes: 'Roll-up shell; little direct warmth.',
    psb_connection_notes: null,
  },
  {
    id: 2,
    company: 'X-Cell Tool & Mold',
    parent_company: 'SyBridge Technologies',
    parent_relationship_kind: 'absorbed_into', // typed child -> should win over former_name
    financial_sponsor: null,
    former_names: null,
    notes: 'Legacy shop. Key contacts: Jaeger (VP Ops), Przybylski (Eng).',
    psb_connection_notes: 'Warm via Behrend senior design, 2019.',
  },
  {
    id: 3,
    company: 'Pyramid Mold',
    parent_company: null, // NOT a typed child — reachable only via Sybridge.former_names
    parent_relationship_kind: null,
    financial_sponsor: null,
    former_names: null,
    notes: 'Second absorbed shop.',
    psb_connection_notes: null,
  },
  {
    id: 4,
    company: 'Acme Plastics', // shares the PE sponsor but is NOT a corporate link
    parent_company: null,
    parent_relationship_kind: null,
    financial_sponsor: 'Crestview Partners',
    former_names: null,
    notes: null,
    psb_connection_notes: null,
  },
  {
    id: 9,
    company: 'Solo Co', // standalone, no links
    parent_company: null,
    parent_relationship_kind: null,
    financial_sponsor: null,
    former_names: null,
    notes: null,
    psb_connection_notes: null,
  },
]

const SUB = {
  2: {
    attachments: [
      {
        attachment_type: 'research_brief',
        title: 'X-Cell Tool & Mold — Deep Research',
        content: '## Contacts\n- Jaeger — VP Operations\n- Przybylski — Engineering Lead',
        created_at: '2026-05-01T12:00:00.000Z',
        created_by: 'Brett',
      },
    ],
    activity_log: [
      { entry_text: '⚑ Flagged for review: confirm Jaeger still there', created_by: 'Brett', created_at: '2026-05-02T09:00:00.000Z' },
      { entry_text: 'Task created: call Przybylski', created_by: 'Kyle', created_at: '2026-05-03T09:00:00.000Z' },
      { entry_text: 'Left voicemail with Jaeger', created_by: 'Kyle', created_at: '2026-05-04T09:00:00.000Z' },
    ],
    tasks: [
      { description: 'Call Przybylski', assignee: 'Kyle', due_date: '2026-06-10', status: 'open', created_by: 'Kyle', created_at: '2026-05-03T09:00:00.000Z', completed_at: null, completed_by: null },
    ],
  },
}

// ── Tiny assert harness ───────────────────────────────────────────────────────

let failures = 0
function check(label, cond) {
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.log(`  ✗ ${label}`)
  }
}

function runMock() {
  console.log('\n=== Sybridge fixture ===')
  const sybridge = ROWS.find((r) => r.id === 1)
  const payload = assemblePayload(sybridge, ROWS, SUB)
  const byCompany = Object.fromEntries(payload.linked_entities.map((l) => [l.company.company, l]))

  check('payload has schema_version 1.1', payload.schema_version === '1.1')
  check('payload.company is Sybridge', payload.company.company === 'SyBridge Technologies')
  check('contacts[] is an array (fixture has none)', Array.isArray(payload.contacts) && payload.contacts.length === 0)
  check('X-Cell is included as a linked entity', !!byCompany['X-Cell Tool & Mold'])
  check('X-Cell relationship is the typed label (absorbed_into wins over former_name)', byCompany['X-Cell Tool & Mold']?.relationship === 'absorbed_into')
  check('X-Cell link_basis is parent_company', byCompany['X-Cell Tool & Mold']?.link_basis === 'parent_company')
  check('Pyramid Mold is included via former_names', byCompany['Pyramid Mold']?.relationship === 'former_name')
  check('Pyramid Mold link_basis is former_names', byCompany['Pyramid Mold']?.link_basis === 'former_names')
  check('PE sibling Acme Plastics is NOT linked (financial_sponsor excluded)', !byCompany['Acme Plastics'])
  check('self-name in former_names does not re-add the primary', !byCompany['SyBridge Technologies'])
  check('no duplicate linked entities (dedup by id)', new Set(payload.linked_entities.map((l) => l.company.id)).size === payload.linked_entities.length)
  check('exactly 2 linked entities (X-Cell + Pyramid)', payload.linked_entities.length === 2)

  const xcell = byCompany['X-Cell Tool & Mold']
  check('X-Cell carries its research_brief attachment (contact names ride along)', xcell?.attachments?.[0]?.type === 'research_brief' && /Jaeger/.test(xcell.attachments[0].body))
  check('X-Cell free-text contacts present on company.notes', /Jaeger/.test(xcell?.company?.notes || '') && /Przybylski/.test(xcell?.company?.notes || ''))
  check('activity type derivation: flag entry -> flag', xcell?.activity_log?.find((e) => /Flagged/.test(e.entry))?.type === 'flag')
  check('activity type derivation: "Task created" -> task', xcell?.activity_log?.find((e) => /Task created/.test(e.entry))?.type === 'task')
  check('activity type derivation: plain note -> note', xcell?.activity_log?.find((e) => /voicemail/.test(e.entry))?.type === 'note')
  check('X-Cell task shaped (task/assignee/status keys)', xcell?.tasks?.[0]?.task === 'Call Przybylski' && xcell.tasks[0].status === 'open')

  console.log('\n=== Standalone company (no links) ===')
  const solo = ROWS.find((r) => r.id === 9)
  const soloPayload = assemblePayload(solo, ROWS, SUB)
  check('linked_entities is empty', Array.isArray(soloPayload.linked_entities) && soloPayload.linked_entities.length === 0)
  check('still valid: company present, contacts empty', soloPayload.company.company === 'Solo Co' && soloPayload.contacts.length === 0)
  check('JSON serializes without error', typeof JSON.stringify(soloPayload) === 'string')

  console.log('\n=== Round-trip contract (import never writes partner-managed fields) ===')
  // Columns the import upsert actually writes (mirror of api/prospects.js import COALESCE/INSERT).
  const IMPORT_WRITES = new Set([
    'company','also_known_as','website','category','in_house_tooling','city','state','country',
    'geography_tier','source_report','priority','employees_approx','year_founded','years_in_business',
    'revenue_known','revenue_est_m','press_count','signal_count','top_signal','rjg_cavity_pressure',
    'medical_device_mfg','key_certifications','ownership_type','recent_ma','parent_company',
    'parent_relationship_kind','financial_sponsor','former_names','decision_location','cwp_contacts',
    'psb_connection_notes','engagement_type','suggested_next_step','legacy_data_potential','notes',
  ])
  const PARTNER_MANAGED = ['outreach_group', 'outreach_rank', 'group_notes', 'last_edited_by']
  for (const f of PARTNER_MANAGED) {
    check(`import does not write partner-managed field "${f}"`, !IMPORT_WRITES.has(f))
  }
  check('former_names round-trips as a JS array (import accepts Array.isArray)', Array.isArray(payload.company.former_names))

  console.log('\n=== Demonstration: assembled Sybridge payload ===')
  console.log(JSON.stringify(payload, null, 2))

  console.log(`\n${failures === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

async function runUrl(baseUrl, id) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/prospects?action=export-json&id=${id}`
  console.log(`\nFetching ${url}`)
  const res = await fetch(url)
  if (!res.ok) {
    console.log(`  ✗ HTTP ${res.status}`)
    process.exit(1)
  }
  const p = await res.json()
  check('has generated_at', typeof p.generated_at === 'string')
  check('has schema_version', p.schema_version === '1.1')
  check('company present', p.company && typeof p.company === 'object')
  check('contacts is an array', Array.isArray(p.contacts))
  check('attachments is an array', Array.isArray(p.attachments))
  check('activity_log is an array', Array.isArray(p.activity_log))
  check('tasks is an array', Array.isArray(p.tasks))
  check('linked_entities is an array', Array.isArray(p.linked_entities))
  console.log(`\n  Company: ${p.company?.company} · linked_entities: ${p.linked_entities?.length}`)
  console.log(`${failures === 0 ? '✓ SHAPE OK' : `✗ ${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

const args = process.argv.slice(2)
if (args.includes('--url')) {
  const baseUrl = args[args.indexOf('--url') + 1]
  const id = args[args.indexOf('--id') + 1]
  if (!baseUrl || !id) {
    console.error('Usage: node scripts/verify-export.js --url <baseUrl> --id <prospectId>')
    process.exit(2)
  }
  runUrl(baseUrl, id)
} else {
  runMock()
}
