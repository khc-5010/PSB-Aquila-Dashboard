import { useState, useEffect } from 'react'

// Single source of truth for the mobile/desktop pivot (see CLAUDE.md "Mobile
// Layout"). Below 1024px (Tailwind `lg`) views may swap in mobile-only
// components; at >=1024px the desktop code paths must render untouched.
export const MOBILE_QUERY = '(max-width: 1023.98px)'

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (e) => setIsMobile(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
