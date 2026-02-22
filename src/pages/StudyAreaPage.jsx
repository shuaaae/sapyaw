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
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Bulan Sea Study Area</h1>
        <p className="mt-2 text-sm text-slate-600 md:text-base">Geographic location and research area boundaries for skipjack tuna monitoring.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <Map />
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Dataset Summary</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-blue-50 p-3">
                <span className="text-sm font-medium text-slate-700">Catch records</span>
                <span className="text-lg font-bold text-blue-700">{catchPoints.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-green-50 p-3">
                <span className="text-sm font-medium text-slate-700">Prediction records</span>
                <span className="text-lg font-bold text-green-700">{predictions.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-purple-50 p-3">
                <span className="text-sm font-medium text-slate-700">Environmental records</span>
                <span className="text-lg font-bold text-purple-700">{envParams.length}</span>
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">Date Range</p>
                <p className="mt-1 text-sm text-slate-700">{dateRange}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Bulan Sea Simulated Dataset Overview</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-4">
            <h3 className="font-semibold text-slate-800">Catch Locations</h3>
            <p className="mt-2 text-sm text-slate-600">
              {simDataset?.catch_locations?.length || 0} monthly records (Jan–Dec 2025). Includes latitude/longitude, catch volume (kg), fishing effort (trips), and CPUE.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-cyan-50 to-white p-4">
            <h3 className="font-semibold text-slate-800">Hotspots</h3>
            <p className="mt-2 text-sm text-slate-600">
              {simDataset?.hotspots?.length || 0} hotspot zones with center points, radius (km), peak months, and average CPUE data.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-green-50 to-white p-4">
            <h3 className="font-semibold text-slate-800">Migration Paths</h3>
            <p className="mt-2 text-sm text-slate-600">
              {simDataset?.migration_paths?.length || 0} migration routes with start/end points, active months, and migration types.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-purple-50 to-white p-4">
            <h3 className="font-semibold text-slate-800">Predictions</h3>
            <p className="mt-2 text-sm text-slate-600">
              {simDataset?.predictions?.length || 0} prediction points with locations, probability levels, and historical trend basis.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            <strong className="font-semibold">Note:</strong> This is a simulated research dataset for thesis visualization (non-commercial). All coordinates are constrained to the Bulan Sea water corridor.
          </p>
        </div>
      </div>
    </section>
  )
}
