import Chart from '../components/Chart.jsx'
import { useEffect, useMemo, useState } from 'react'
import { getBulanSeaSimulatedDataset } from '../services/dataService.js'

function pointInPolygon(point, polygon) {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

const monthOrder = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function monthLabel(monthName) {
  const idx = monthOrder.indexOf(monthName)
  if (idx < 0) return 'Unknown'
  const d = new Date(2025, idx, 1)
  return d.toLocaleString(undefined, { month: 'short', year: 'numeric' })
}

export default function ChartsData() {
  const [dataset, setDataset] = useState(null)

  const latOffset = -0.02
  const lngOffset = -0.03

  const marinePolygon = useMemo(() => {
    const poly = [
      [123.72, 12.585],
      [123.74, 12.570],
      [123.80, 12.565],
      [123.88, 12.585],
      [123.91, 12.630],
      [123.91, 12.705],
      [123.88, 12.748],
      [123.80, 12.760],
      [123.75, 12.735],
      [123.71, 12.675],
    ]
    return poly.map(([lng, lat]) => [lng + lngOffset, lat + latOffset])
  }, [latOffset, lngOffset])

  const isMarine = useMemo(() => {
    return (lat, lng) => pointInPolygon([lng, lat], marinePolygon)
  }, [marinePolygon])

  useEffect(() => {
    let cancelled = false
    getBulanSeaSimulatedDataset().then((data) => {
      if (cancelled) return
      setDataset(data || null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const catchLocations = useMemo(() => {
    const rows = dataset?.catch_locations ?? []
    return rows.filter((r) => isMarine(r.latitude + latOffset, r.longitude + lngOffset))
  }, [dataset, isMarine, latOffset, lngOffset])

  const monthly = useMemo(() => {
    const map = new Map()
    for (const m of monthOrder) {
      map.set(m, { catchKg: 0, trips: 0, cpueSum: 0, n: 0 })
    }
    for (const r of catchLocations) {
      const m = r.month
      if (!map.has(m)) continue
      const prev = map.get(m)
      const catchKg = Number(r.catch_volume_kg) || 0
      const trips = Number(r.fishing_effort_trips) || 0
      const cpue = Number(r.CPUE) || 0
      map.set(m, {
        catchKg: prev.catchKg + catchKg,
        trips: prev.trips + trips,
        cpueSum: prev.cpueSum + cpue,
        n: prev.n + 1,
      })
    }

    return monthOrder.map((m) => {
      const v = map.get(m)
      return {
        key: `2025-${String(monthOrder.indexOf(m) + 1).padStart(2, '0')}`,
        label: monthLabel(m),
        catchKg: v.catchKg,
        cpue: v.n ? v.cpueSum / v.n : 0,
        trips: v.trips,
      }
    })
  }, [catchLocations])

  const totalCatchKg = useMemo(() => monthly.reduce((s, r) => s + (Number(r.catchKg) || 0), 0), [monthly])
  const totalTrips = useMemo(() => monthly.reduce((s, r) => s + (Number(r.trips) || 0), 0), [monthly])
  const overallCpue = useMemo(() => {
    const points = catchLocations.map((r) => Number(r.CPUE) || 0).filter((v) => v > 0)
    if (!points.length) return 0
    return points.reduce((s, v) => s + v, 0) / points.length
  }, [catchLocations])

  const catchChartData = useMemo(
    () => ({
      labels: monthly.map((m) => m.label),
      datasets: [
        {
          label: 'Catch (kg)',
          data: monthly.map((m) => m.catchKg),
          backgroundColor: '#2563eb',
        },
      ],
    }),
    [monthly],
  )

  const cpueChartData = useMemo(
    () => ({
      labels: monthly.map((m) => m.label),
      datasets: [
        {
          label: 'CPUE (kg/hour)',
          data: monthly.map((m) => Number(m.cpue.toFixed(2))),
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15,118,110,0.2)',
          tension: 0.25,
        },
      ],
    }),
    [monthly],
  )

  const commonOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
      },
    }),
    [],
  )

  return (
    <section className="border border-slate-300 bg-white shadow-sm">
      <div className="border-b border-slate-300 p-4">
        <h1 className="text-xl font-semibold text-slate-900">Charts & Data</h1>
        <p className="mt-1 text-[12px] text-slate-700">Catch data charts and CPUE (mock data wired).</p>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="rounded-sm border border-slate-300 bg-slate-50 p-4 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-sm border border-slate-300 bg-white p-3">
              <div className="text-[11px] font-semibold text-slate-700">Records</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{catchLocations.length}</div>
            </div>
            <div className="rounded-sm border border-slate-300 bg-white p-3">
              <div className="text-[11px] font-semibold text-slate-700">Total Catch (kg)</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{Math.round(totalCatchKg)}</div>
            </div>
            <div className="rounded-sm border border-slate-300 bg-white p-3">
              <div className="text-[11px] font-semibold text-slate-700">Overall CPUE (kg/hour)</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{overallCpue.toFixed(2)}</div>
            </div>
            <div className="rounded-sm border border-slate-300 bg-white p-3">
              <div className="text-[11px] font-semibold text-slate-700">Trips (sum)</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{totalTrips}</div>
            </div>
          </div>
        </div>

        <div className="rounded-sm border border-slate-300 bg-slate-50 p-4">
          <h2 className="text-[12px] font-semibold text-slate-900">Catch Data</h2>
          <div className="mt-3">
            <Chart type="bar" data={catchChartData} options={commonOptions} height={260} />
          </div>
        </div>
        <div className="rounded-sm border border-slate-300 bg-slate-50 p-4">
          <h2 className="text-[12px] font-semibold text-slate-900">CPUE Trend</h2>
          <div className="mt-3">
            <Chart type="line" data={cpueChartData} options={commonOptions} height={260} />
          </div>
        </div>
      </div>
    </section>
  )
}
