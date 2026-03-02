import Chart from '../components/Chart.jsx'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getBulanSeaSimulatedDataset } from '../services/dataService.js'
import { coefficientOfVariation, computeCpue, linearTrend, mean, pearsonCorrelation, percentageContribution, standardDeviation } from '../utils/statistics.js'

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
  const [searchParams] = useSearchParams()
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
      map.set(m, { catchKg: 0, trips: 0 })
    }
    for (const r of catchLocations) {
      const m = r.month
      if (!map.has(m)) continue
      const prev = map.get(m)
      const catchKg = Number(r.catch_volume_kg) || 0
      const trips = Number(r.fishing_effort_trips) || 0
      map.set(m, {
        catchKg: prev.catchKg + catchKg,
        trips: prev.trips + trips,
      })
    }

    return monthOrder.map((m) => {
      const v = map.get(m)
      return {
        key: `2025-${String(monthOrder.indexOf(m) + 1).padStart(2, '0')}`,
        label: monthLabel(m),
        catchKg: v.catchKg,
        cpue: computeCpue(v.catchKg, v.trips),
        trips: v.trips,
      }
    })
  }, [catchLocations])

  const totalCatchKg = useMemo(() => monthly.reduce((s, r) => s + (Number(r.catchKg) || 0), 0), [monthly])
  const totalTrips = useMemo(() => monthly.reduce((s, r) => s + (Number(r.trips) || 0), 0), [monthly])
  const overallCpue = useMemo(() => computeCpue(totalCatchKg, totalTrips), [totalCatchKg, totalTrips])
  const monthlyCatchValues = useMemo(() => monthly.map((m) => Number(m.catchKg) || 0), [monthly])
  const monthlyCpueValues = useMemo(() => monthly.map((m) => Number(m.cpue) || 0), [monthly])
  const catchMean = useMemo(() => mean(monthlyCatchValues), [monthlyCatchValues])
  const catchSd = useMemo(() => standardDeviation(monthlyCatchValues), [monthlyCatchValues])
  const catchCv = useMemo(() => coefficientOfVariation(monthlyCatchValues), [monthlyCatchValues])
  const cpueMean = useMemo(() => mean(monthlyCpueValues), [monthlyCpueValues])
  const cpueTrend = useMemo(() => linearTrend(monthlyCpueValues), [monthlyCpueValues])
  const maxMonthlyCatchPct = useMemo(() => {
    const maxMonthlyCatch = Math.max(...monthlyCatchValues, 0)
    return percentageContribution(maxMonthlyCatch, totalCatchKg)
  }, [monthlyCatchValues, totalCatchKg])
  const catchEffortCorrelation = useMemo(() => pearsonCorrelation(monthlyCatchValues, monthly.map((m) => Number(m.trips) || 0)), [monthlyCatchValues, monthly])

  const anova = useMemo(() => {
    const seasonGroups = { NE: [], SW: [], IM: [] }
    for (const r of monthly) {
      const m = r.label.split(' ')[0]
      if (['Dec', 'Jan', 'Feb'].includes(m)) seasonGroups.NE.push(r.cpue)
      else if (['Jun', 'Jul', 'Aug'].includes(m)) seasonGroups.SW.push(r.cpue)
      else seasonGroups.IM.push(r.cpue)
    }
    const all = [...seasonGroups.NE, ...seasonGroups.SW, ...seasonGroups.IM]
    const grand = mean(all)
    const k = 3
    const n = all.length
    const ssb = Object.values(seasonGroups).reduce((s, g) => s + g.length * (mean(g) - grand) ** 2, 0)
    const ssw = Object.values(seasonGroups).reduce((s, g) => s + g.reduce((t, v) => t + (v - mean(g)) ** 2, 0), 0)
    const msb = ssb / (k - 1)
    const msw = ssw / (n - k)
    const f = msw > 0 ? msb / msw : 0
    return { msb, msw, f }
  }, [monthly])

  const chiSquare = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0 }
    for (const r of catchLocations) counts[r.abundance_level] = (counts[r.abundance_level] || 0) + 1
    const expected = catchLocations.length / 3 || 1
    const value = ['low', 'medium', 'high'].reduce((s, key) => s + ((counts[key] - expected) ** 2) / expected, 0)
    return { counts, expected, value }
  }, [catchLocations])

  const showStatsFormulaContext = searchParams.get('formula') === 'stats'

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
          label: 'CPUE (kg/trip)',
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
    <section className="space-y-6">
      {showStatsFormulaContext && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="text-sm font-semibold text-blue-900">Statistical Formula Context</div>
          <div className="mt-1 text-sm text-blue-800">
            Mean={catchMean.toFixed(2)}, SD={catchSd.toFixed(2)}, CV={catchCv.toFixed(2)}%, Pearson r={catchEffortCorrelation.toFixed(4)}
          </div>
          <div className="mt-1 text-sm text-blue-900">
            Trend: Y = {cpueTrend.intercept.toFixed(4)} + ({cpueTrend.slope.toFixed(4)})X, ANOVA F={anova.f.toFixed(4)}, Chi-square={chiSquare.value.toFixed(2)}
          </div>
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Charts & Data</h1>
        <p className="mt-2 text-sm text-slate-600 md:text-base">Monthly catch data, CPUE trends, and statistical analysis.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-3">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-600">Records</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{catchLocations.length}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-green-50 to-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-3">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-600">Total Catch</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{Math.round(totalCatchKg)} kg</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-purple-50 to-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-3">
              <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-600">Avg CPUE</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{overallCpue.toFixed(2)}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-3">
              <svg className="h-6 w-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-600">Total Trips</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{totalTrips}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Monthly Catch Data</h2>
          <p className="mt-1 text-sm text-slate-600">Total catch volume by month (kg)</p>
          <div className="mt-6">
            <Chart type="bar" data={catchChartData} options={commonOptions} height={300} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">CPUE Trend Analysis</h2>
          <p className="mt-1 text-sm text-slate-600">Catch per unit effort over time (kg/trip)</p>
          <div className="mt-6">
            <Chart type="line" data={cpueChartData} options={commonOptions} height={300} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Statistical Treatment Snapshot</h2>
        <p className="mt-1 text-sm text-slate-600">Descriptive and trend metrics computed from monthly catch and CPUE.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-600">Mean Monthly Catch</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{catchMean.toFixed(2)} kg</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-600">Catch Standard Deviation</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{catchSd.toFixed(2)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-600">Catch Coefficient of Variation</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{catchCv.toFixed(2)}%</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-600">Mean Monthly CPUE</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{cpueMean.toFixed(2)} kg/trip</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-600">CPUE Trend Slope</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{cpueTrend.slope.toFixed(4)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-600">Highest-Month Catch Contribution</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{maxMonthlyCatchPct.toFixed(2)}%</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-600">Pearson r (Catch vs Trips)</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{catchEffortCorrelation.toFixed(4)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-600">ANOVA F</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{anova.f.toFixed(4)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-600">Chi-square</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{chiSquare.value.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
