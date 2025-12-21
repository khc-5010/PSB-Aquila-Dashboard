import { useState, useEffect } from 'react'

const STAGES = [
  { id: 'lead', name: 'Lead', color: 'bg-gray-100' },
  { id: 'qualified', name: 'Qualified', color: 'bg-blue-100' },
  { id: 'proposal', name: 'Proposal', color: 'bg-yellow-100' },
  { id: 'negotiation', name: 'Negotiation', color: 'bg-orange-100' },
  { id: 'active', name: 'Active', color: 'bg-green-100' },
  { id: 'complete', name: 'Complete', color: 'bg-purple-100' },
]

function App() {
  const [dbStatus, setDbStatus] = useState('checking')

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setDbStatus(data.database ? 'connected' : 'disconnected'))
      .catch(() => setDbStatus('disconnected'))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">PSB-Aquila Opportunity Tracker</h1>
            <p className="text-sm text-gray-500">Industrial AI Alliance Pipeline</p>
          </div>
          <div className="flex items-center gap-4">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm ${
              dbStatus === 'connected'
                ? 'bg-green-100 text-green-700'
                : dbStatus === 'checking'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-red-100 text-red-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                dbStatus === 'connected'
                  ? 'bg-green-500'
                  : dbStatus === 'checking'
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`} />
              {dbStatus === 'connected' ? 'Database Connected' : dbStatus === 'checking' ? 'Checking...' : 'Database Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Kanban Board */}
      <main className="p-6">
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <div
              key={stage.id}
              className={`flex-shrink-0 w-72 ${stage.color} rounded-lg p-4`}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-700">{stage.name}</h2>
                <span className="bg-white px-2 py-0.5 rounded text-sm text-gray-500">0</span>
              </div>

              <div className="space-y-3 min-h-[200px]">
                {/* Placeholder card */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 opacity-50">
                  <p className="text-sm text-gray-400 text-center">No opportunities</p>
                </div>
              </div>

              <button className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-white/50 rounded transition-colors">
                + Add Opportunity
              </button>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3">
        <p className="text-sm text-gray-500 text-center">
          PSB-Aquila Partnership Dashboard &bull; Built for Kyle, Duane & Steve
        </p>
      </footer>
    </div>
  )
}

export default App
