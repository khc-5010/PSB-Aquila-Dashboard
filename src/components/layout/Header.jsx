import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import AdminPanel from '../auth/AdminPanel'
import ChangePinModal from '../auth/ChangePinModal'

function Header({ dbStatus, activeView, onViewChange }) {
  const { user, logout, authFetch } = useAuth()
  const [showAdmin, setShowAdmin] = useState(false)
  const [showChangePin, setShowChangePin] = useState(false)
  const [teamUsers, setTeamUsers] = useState([])

  // Fetch active team members for avatar display
  useEffect(() => {
    if (user?.role === 'admin') {
      authFetch('/api/auth?action=list-users')
        .then(res => res.ok ? res.json() : [])
        .then(data => setTeamUsers(data.filter(u => u.is_active)))
        .catch(() => {})
    }
  }, [user, authFetch])

  // Other active users (not the current user)
  const otherUsers = teamUsers.filter(u => u.id !== user?.id)

  return (
    <>
      <header
        className="h-16 px-6 shadow-md"
        style={{ background: 'linear-gradient(to right, #041E42, #164E63)' }}
      >
        <div className="h-full flex items-center justify-between">
          {/* Left side - Logo and title */}
          <div className="flex items-center gap-4">
            <img
              src="/aquila-logo.png"
              alt="Aquila"
              className="h-10"
            />
            <h1 className="text-xl font-semibold text-white">
              AI<sup className="text-sm">2</sup> Opportunity Tracker
            </h1>

            {/* Navigation Tabs */}
            <div className="ml-6 flex bg-white/10 rounded-lg p-1">
              <button
                onClick={() => onViewChange('prospects')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeView === 'prospects'
                    ? 'bg-white text-[#041E42]'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                Prospects
              </button>
              <button
                onClick={() => onViewChange('pipeline')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeView === 'pipeline'
                    ? 'bg-white text-[#041E42]'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                Pipeline
              </button>
              <button
                onClick={() => onViewChange('analytics')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeView === 'analytics'
                    ? 'bg-white text-[#041E42]'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                Analytics
              </button>
            </div>
          </div>

          {/* Right side - Actions and user */}
          <div className="flex items-center gap-4">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm ${
              dbStatus === 'connected'
                ? 'bg-green-500/20 text-green-200'
                : dbStatus === 'checking'
                ? 'bg-yellow-500/20 text-yellow-200'
                : 'bg-red-500/20 text-red-200'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                dbStatus === 'connected'
                  ? 'bg-green-400'
                  : dbStatus === 'checking'
                  ? 'bg-yellow-400'
                  : 'bg-red-400'
              }`} />
              {dbStatus === 'connected' ? 'Connected' : dbStatus === 'checking' ? 'Checking...' : 'Offline'}
            </span>

            {/* Other team members (smaller avatars) */}
            {otherUsers.length > 0 && (
              <div className="flex items-center -space-x-2">
                {otherUsers.map((u) => (
                  <div
                    key={u.id}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium ring-2 ring-white/20"
                    style={{ backgroundColor: u.color }}
                    title={u.name}
                  >
                    {u.name[0]}
                  </div>
                ))}
              </div>
            )}

            {/* Current user avatar (prominent) */}
            {user && (
              <div className="flex items-center gap-2">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold ring-2 ring-white/40"
                  style={{ backgroundColor: user.color }}
                  title={user.name}
                >
                  {user.name[0]}
                </div>
                <span className="text-sm text-white/90 font-medium hidden sm:inline">{user.name}</span>
              </div>
            )}

            {/* Admin icon */}
            {user?.role === 'admin' && (
              <button
                onClick={() => setShowAdmin(true)}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="User Management"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              </button>
            )}

            {/* Change PIN */}
            <button
              onClick={() => setShowChangePin(true)}
              className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Change PIN"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
              </svg>
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Sign Out"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Admin Panel Modal */}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showChangePin && <ChangePinModal onClose={() => setShowChangePin(false)} />}
    </>
  )
}

export default Header
