function Header({ dbStatus, onAddOpportunity }) {
  const users = [
    { name: 'Kyle', color: '#7C3AED' },
    { name: 'Duane', color: '#0891B2' },
    { name: 'Steve', color: '#D97706' },
  ]

  return (
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
        </div>

        {/* Right side - Actions and user avatars */}
        <div className="flex items-center gap-4">
          <button
            onClick={onAddOpportunity}
            className="px-4 py-2 text-sm font-medium text-white bg-white/20 rounded-lg hover:bg-white/30 transition-colors border border-white/30"
          >
            + Add Opportunity
          </button>

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

          {/* User avatars */}
          <div className="flex items-center -space-x-2">
            {users.map((user) => (
              <div
                key={user.name}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ring-2 ring-white/20"
                style={{ backgroundColor: user.color }}
                title={user.name}
              >
                {user.name[0]}
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
