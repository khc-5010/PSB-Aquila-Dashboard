import { useState, useRef, useEffect } from 'react'

export default function InfoTooltip({ text }) {
  const [show, setShow] = useState(false)
  const [above, setAbove] = useState(true)
  const iconRef = useRef(null)

  useEffect(() => {
    if (show && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect()
      setAbove(rect.top > 80)
    }
  }, [show])

  return (
    <span className="relative inline-flex items-center ml-1">
      <span
        ref={iconRef}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="inline-flex items-center justify-center w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help transition-colors"
        aria-label="More information"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
      </span>
      {show && (
        <span
          role="tooltip"
          className={`absolute z-50 left-1/2 -translate-x-1/2 max-w-[250px] px-3 py-2 text-xs text-white bg-gray-900 rounded-lg shadow-lg whitespace-normal leading-relaxed pointer-events-none ${
            above ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {text}
        </span>
      )}
    </span>
  )
}
