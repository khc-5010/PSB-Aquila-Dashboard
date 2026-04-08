import ReactMarkdown from 'react-markdown'

/**
 * Detects if a list item represents a numbered company entry.
 * Patterns: "1. **CompanyName**" or "**1. CompanyName**"
 * Returns the company name if matched, null otherwise.
 */
function extractCompanyName(children) {
  if (!children || !Array.isArray(children)) return null

  // Walk the first few children looking for a <strong> that matches a company pattern
  for (let i = 0; i < Math.min(children.length, 2); i++) {
    const child = children[i]
    if (!child) continue

    // Check if this child is a strong element (ReactMarkdown renders **text** as <strong>)
    if (child.type === 'strong' || (child.props && child.props.node?.tagName === 'strong')) {
      const text = extractText(child)
      if (text && text.length > 0) {
        // The list item number is handled by <ol>/<li>, so the strong text IS the company name
        return text
      }
    }
  }

  return null
}

/** Recursively extract plain text from React elements */
function extractText(element) {
  if (typeof element === 'string') return element
  if (!element) return ''
  if (element.props?.children) {
    const children = Array.isArray(element.props.children)
      ? element.props.children
      : [element.props.children]
    return children.map(extractText).join('')
  }
  return ''
}

/**
 * Custom ReactMarkdown component overrides for report formatting.
 * Makes company entries scannable: larger names, indented fields, spacing between entries.
 */
const reportComponents = {
  // Ordered list: add spacing between company entries
  ol: ({ children, ...props }) => (
    <ol className="list-none pl-0 space-y-0" {...props}>{children}</ol>
  ),

  // List items: detect company entries and apply enhanced formatting
  li: ({ children, node, ...props }) => {
    // Check if this list item starts with a bold element (company name pattern)
    const childArray = Array.isArray(children) ? children : [children]
    const companyName = extractCompanyName(childArray)

    if (companyName) {
      // This is a company entry — split into company name header + indented fields
      const firstChild = childArray[0]
      const restChildren = childArray.slice(1)

      return (
        <li className="mb-6 list-none" {...props}>
          {/* Company name at header size */}
          <div className="text-base font-semibold text-[#041E42] mb-1">
            {firstChild}
          </div>
          {/* Indented data fields */}
          <div className="pl-4 space-y-0.5 text-sm text-gray-700">
            {restChildren}
          </div>
        </li>
      )
    }

    // Standard list item
    return <li className="mb-1" {...props}>{children}</li>
  },

  // Paragraphs inside company entries get tighter spacing
  p: ({ children, ...props }) => (
    <p className="mb-1.5 leading-relaxed" {...props}>{children}</p>
  ),

  // Strong text: field labels (e.g., "Location:") vs company names
  strong: ({ children, ...props }) => {
    const text = typeof children === 'string' ? children
      : Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : '').join('')
      : ''

    // Field label pattern: ends with colon (e.g., "Location:", "Scale:")
    if (text.endsWith(':')) {
      return <strong className="font-semibold text-gray-600" {...props}>{children}</strong>
    }

    return <strong className="font-semibold" {...props}>{children}</strong>
  },

  // Unordered lists
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-5 space-y-1 my-2" {...props}>{children}</ul>
  ),

  // Headings (h3, h4) within section content
  h3: ({ children, ...props }) => (
    <h3 className="text-base font-semibold text-[#041E42] mt-4 mb-2" {...props}>{children}</h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-sm font-semibold text-gray-800 mt-3 mb-1" {...props}>{children}</h4>
  ),
}

/**
 * Shared markdown renderer for research reports and briefs.
 * Applies company-entry formatting: larger names, indented fields, spacing between entries.
 */
export default function ReportMarkdownRenderer({ content }) {
  if (!content) return null

  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown components={reportComponents}>{content}</ReactMarkdown>
    </div>
  )
}
