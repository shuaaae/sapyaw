import { useState } from 'react'

export default function Navbar({ onMenuToggle }) {
  const [showInfo, setShowInfo] = useState(false)

  return (
    <header className="sticky top-0 z-[1000] w-full border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-4 px-4 py-3 md:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 shadow-md">
            <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <h1 className="text-base font-bold text-slate-900 md:text-lg">SAPYAW</h1>
            <p className="hidden text-xs text-slate-600 sm:block md:text-sm">Bulan Sea Tuna Monitoring System</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowInfo(!showInfo)}
            className="hidden h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:flex"
            aria-label="Information"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden md:inline">Info</span>
          </button>
          
          <button
            type="button"
            onClick={onMenuToggle}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-50 lg:hidden"
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {showInfo && (
        <div className="border-t border-slate-200 bg-blue-50 px-4 py-3 md:px-6 lg:px-8">
          <div className="mx-auto max-w-[1920px]">
            <p className="text-sm text-slate-700">
              <strong className="font-semibold text-slate-900">Research Project:</strong> This system provides spatial analysis and prediction of skipjack tuna distribution in Bulan Sea using simulated research data for thesis visualization.
            </p>
          </div>
        </div>
      )}
    </header>
  )
}
