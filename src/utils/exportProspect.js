// Helpers for the per-company "Export JSON" feature.
// - downloadJson mirrors the Blob + anchor download in ProspectTable.jsx (exportToCSV).
// - copyText mirrors the navigator.clipboard + textarea fallback in ResearchPromptModal.jsx.
// The JSON payload itself is assembled server-side by GET /api/prospects?action=export-json.

/** Trigger a browser download of `obj` (object or pre-stringified JSON) as a .json file. */
export function downloadJson(obj, filename) {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Copy `text` to the clipboard. Returns true on success. Falls back to execCommand for
 *  older / non-secure-context browsers (same pattern as ResearchPromptModal). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    document.body.removeChild(textarea)
    return ok
  }
}

/** Human-readable byte size of a string, e.g. "12.4 KB" — for the export modal's size indicator. */
export function formatBytes(str) {
  const bytes = new Blob([str || '']).size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Filesystem-safe slug from a company name, e.g. "X-Cell Tool & Mold" -> "x-cell-tool-mold". */
export function companySlug(name) {
  return (
    (name || 'company')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'company'
  )
}
