import { useEffect, useMemo, useState } from 'react'
import { getCatchPoints, getPredictions } from '../services/dataService.js'

function toCsv(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (v) => {
    const s = v == null ? '' : String(v)
    if (/[\n\r",]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(','))
  }
  return lines.join('\n')
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function Downloads() {
  const [catchPoints, setCatchPoints] = useState([])
  const [predictions, setPredictions] = useState([])

  useEffect(() => {
    let cancelled = false
    getCatchPoints().then((rows) => {
      if (cancelled) return
      setCatchPoints(Array.isArray(rows) ? rows : [])
    })
    getPredictions().then((rows) => {
      if (cancelled) return
      setPredictions(Array.isArray(rows) ? rows : [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const catchCsv = useMemo(() => toCsv(catchPoints), [catchPoints])
  const predCsv = useMemo(() => toCsv(predictions), [predictions])

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Downloads</h1>
        <p className="mt-2 text-sm text-slate-600 md:text-base">Export research data, charts, and reports for offline analysis.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Available Downloads</h2>
          <p className="mt-1 text-sm text-slate-600">Export data in CSV format for further analysis</p>
          <div className="mt-6 space-y-3">
            <button
              className="group flex w-full items-center justify-between rounded-lg border border-slate-200 bg-gradient-to-r from-blue-50 to-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-md disabled:opacity-50"
              onClick={() => downloadText('catch_points.csv', catchCsv)}
              disabled={!catchCsv}
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Catch Data</div>
                  <div className="text-sm text-slate-600">CSV format</div>
                </div>
              </div>
              <svg className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              className="group flex w-full items-center justify-between rounded-lg border border-slate-200 bg-gradient-to-r from-green-50 to-white p-4 text-left transition-all hover:border-green-300 hover:shadow-md disabled:opacity-50"
              onClick={() => downloadText('predictions.csv', predCsv)}
              disabled={!predCsv}
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2">
                  <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Distribution Predictions</div>
                  <div className="text-sm text-slate-600">CSV format</div>
                </div>
              </div>
              <svg className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              className="group flex w-full items-center justify-between rounded-lg border border-slate-200 bg-gradient-to-r from-purple-50 to-white p-4 text-left transition-all hover:border-purple-300 hover:shadow-md"
              onClick={() => downloadText('readme.txt', 'Mock downloads only. Replace dataService with Supabase/CSV later.')}
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Summary Notes</div>
                  <div className="text-sm text-slate-600">TXT format</div>
                </div>
              </div>
              <svg className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Dataset Information</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-blue-50 p-3">
                <span className="text-sm font-medium text-slate-700">Catch records</span>
                <span className="text-lg font-bold text-blue-700">{catchPoints.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-green-50 p-3">
                <span className="text-sm font-medium text-slate-700">Prediction records</span>
                <span className="text-lg font-bold text-green-700">{predictions.length}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="flex gap-3">
              <svg className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="font-semibold text-amber-900">Data Source</h3>
                <p className="mt-1 text-sm text-amber-800">
                  These downloads come from the current data source in <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">services/dataService.js</code>. This is simulated research data for thesis visualization purposes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
