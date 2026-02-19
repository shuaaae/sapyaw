import Map from '../components/Map.jsx'
import { useEffect, useMemo, useState } from 'react'
import {
  getCatchPoints,
  getEnvironmentalParams,
  getPredictions,
  getBulanSeaSimulatedDataset,
} from '../services/dataService.js'

export default function StudyAreaPage() {
  const [catchPoints, setCatchPoints] = useState([])
  const [envParams, setEnvParams] = useState([])
  const [predictions, setPredictions] = useState([])
  const [simDataset, setSimDataset] = useState(null)

  useEffect(() => {
    let cancelled = false
    getCatchPoints().then((rows) => {
      if (cancelled) return
      setCatchPoints(Array.isArray(rows) ? rows : [])
    })
    getEnvironmentalParams().then((rows) => {
      if (cancelled) return
      setEnvParams(Array.isArray(rows) ? rows : [])
    })
    getPredictions().then((rows) => {
      if (cancelled) return
      setPredictions(Array.isArray(rows) ? rows : [])
    })
    getBulanSeaSimulatedDataset().then((data) => {
      if (cancelled) return
      setSimDataset(data || null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const dateRange = useMemo(() => {
    const dates = catchPoints
      .map((r) => new Date(r.date))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a - b)
    if (!dates.length) return '—'
    const fmt = (d) => d.toLocaleDateString()
    return `${fmt(dates[0])} to ${fmt(dates[dates.length - 1])}`
  }, [catchPoints])

  return (
    <section className="border border-slate-300 bg-white shadow-sm">
      <div className="border-b border-slate-300 p-4">
        <h1 className="text-xl font-semibold text-slate-900">Bulan Sea Study Area</h1>
        <p className="mt-1 text-[12px] text-slate-700">Study area location and basemap (mock data wired).</p>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
        <Map />

        <div className="rounded-sm border border-slate-300 bg-slate-50 p-4">
          <h2 className="text-[12px] font-semibold text-slate-900">Dataset Summary</h2>
          <div className="mt-3 space-y-2 text-[12px] text-slate-700">
            <div className="flex items-center justify-between"><span>Catch records</span><span className="font-semibold text-slate-900">{catchPoints.length}</span></div>
            <div className="flex items-center justify-between"><span>Prediction records</span><span className="font-semibold text-slate-900">{predictions.length}</span></div>
            <div className="flex items-center justify-between"><span>Environmental records</span><span className="font-semibold text-slate-900">{envParams.length}</span></div>
            <div className="pt-2 text-[11px] text-slate-600">Catch date range: {dateRange}</div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="rounded-sm border border-slate-300 bg-slate-50 p-4">
          <h2 className="text-[12px] font-semibold text-slate-900">Bulan Sea Simulated Dataset Overview</h2>
          <div className="mt-3 space-y-4 text-[12px] text-slate-700">
            <div>
              <h3 className="font-semibold text-slate-800">Catch Locations (Monthly Records)</h3>
              <div className="mt-1 text-[11px] text-slate-600">
                {simDataset?.catch_locations?.length || 0} records (Jan–Dec 2025). Each record includes latitude/longitude, month, catch volume (kg), fishing effort (trips), and CPUE.
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Hotspots</h3>
              <div className="mt-1 text-[11px] text-slate-600">
                {simDataset?.hotspots?.length || 0} hotspot zones. Each provides a center point, radius (km), peak month, and average CPUE.
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Migration Paths</h3>
              <div className="mt-1 text-[11px] text-slate-600">
                {simDataset?.migration_paths?.length || 0} migration routes. Each includes start/end points, active months, and migration type (short/medium/long).
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Predictions</h3>
              <div className="mt-1 text-[11px] text-slate-600">
                {simDataset?.predictions?.length || 0} prediction points. Each includes a location, probability level, and basis (historical catch trend).
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Seasonal Summary</h3>
              <div className="mt-1 text-[11px] text-slate-600">
                Aggregated statistics by monsoon season: average catch, average CPUE, and dominant tuna zone.
              </div>
            </div>
            <div className="pt-2 text-[11px] text-slate-600">
              <strong>Note:</strong> This is a simulated research dataset for thesis visualization (non-commercial). All coordinates are constrained to the Bulan Sea water corridor.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
