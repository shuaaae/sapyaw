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
    <section className="border border-slate-300 bg-white shadow-sm">
      <div className="border-b border-slate-300 p-4">
        <h1 className="text-xl font-semibold text-slate-900">Downloads</h1>
        <p className="mt-1 text-[12px] text-slate-700">Export datasets (mock data wired).</p>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="rounded-sm border border-slate-300 bg-slate-50 p-4">
          <h2 className="text-[12px] font-semibold text-slate-900">Download Reports</h2>
          <div className="mt-3 grid gap-2">
            <button
              className="w-full rounded-sm border border-slate-300 bg-sky-800 px-3 py-2 text-left text-[12px] font-semibold text-white hover:bg-sky-900"
              onClick={() => downloadText('catch_points.csv', catchCsv)}
              disabled={!catchCsv}
            >
              Catch Data (CSV)
            </button>
            <button
              className="w-full rounded-sm border border-slate-300 bg-sky-800 px-3 py-2 text-left text-[12px] font-semibold text-white hover:bg-sky-900"
              onClick={() => downloadText('predictions.csv', predCsv)}
              disabled={!predCsv}
            >
              Distribution Predictions (CSV)
            </button>
            <button
              className="w-full rounded-sm border border-slate-300 bg-sky-800 px-3 py-2 text-left text-[12px] font-semibold text-white hover:bg-sky-900"
              onClick={() => downloadText('readme.txt', 'Mock downloads only. Replace dataService with Supabase/CSV later.')}
            >
              Summary Notes (TXT)
            </button>
          </div>
        </div>

        <div className="rounded-sm border border-slate-300 bg-slate-50 p-4">
          <h2 className="text-[12px] font-semibold text-slate-900">Notes</h2>
          <div className="mt-3 rounded-sm border border-slate-300 bg-white p-3 text-[12px] text-slate-700">
            <div>Catch records: {catchPoints.length}</div>
            <div>Prediction records: {predictions.length}</div>
            <div className="mt-2 text-[11px] text-slate-600">
              These downloads come from the current data source in <code>services/dataService.js</code>.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
