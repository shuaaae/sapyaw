import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBulanSeaSimulatedDataset, getPredictions } from '../services/dataService.js'
import {
  coefficientOfVariation,
  computeCpue,
  computeMigrationPatternIndex,
  computeShelfLifePredictionAccuracy,
  linearTrend,
  mean,
  pearsonCorrelation,
  percentageContribution,
  standardDeviation,
} from '../utils/statistics.js'

function distanceKm(a, b) {
  const R = 6371
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

function seasonFromMonth(month) {
  const ne = ['December', 'January', 'February']
  const sw = ['June', 'July', 'August']
  if (ne.includes(month)) return 'NE'
  if (sw.includes(month)) return 'SW'
  return 'IM'
}

function Fraction({ numerator, denominator }) {
  return (
    <span className="inline-flex flex-col items-center align-middle px-1">
      <span className="leading-tight">{numerator}</span>
      <span className="w-full border-t border-slate-700" />
      <span className="leading-tight">{denominator}</span>
    </span>
  )
}

export default function FormulaSolutions() {
  const [dataset, setDataset] = useState(null)
  const [predictions, setPredictions] = useState([])

  const monthOrder = useMemo(
    () => [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
    [],
  )

  useEffect(() => {
    let cancelled = false
    getBulanSeaSimulatedDataset().then((data) => {
      if (cancelled) return
      setDataset(data || null)
    })
    getPredictions().then((rows) => {
      if (cancelled) return
      setPredictions(Array.isArray(rows) ? rows : [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const computed = useMemo(() => {
    const rows = dataset?.catch_locations ?? []
    const monthMap = new Map(monthOrder.map((m) => [m, { catchKg: 0, trips: 0, cpue: 0 }]))

    for (const r of rows) {
      const rec = monthMap.get(r.month)
      if (!rec) continue
      rec.catchKg += Number(r.catch_volume_kg) || 0
      rec.trips += Number(r.fishing_effort_trips) || 0
      rec.cpue = computeCpue(rec.catchKg, rec.trips)
    }

    const monthly = monthOrder.map((m, i) => ({
      idx: i + 1,
      month: m,
      ...monthMap.get(m),
    }))

    const monthlyCatch = monthly.map((m) => m.catchKg)
    const monthlyCpue = monthly.map((m) => m.cpue)
    const monthlyTrips = monthly.map((m) => m.trips)

    const totalCatch = monthlyCatch.reduce((s, v) => s + v, 0)
    const cpueMax = Math.max(...rows.map((r) => Number(r.CPUE) || 0), 0)
    const sampleLocation = rows.find((r) => r.id === 'cl21') || rows[0]
    const sampleLocationCpue = Number(sampleLocation?.CPUE) || 0
    const tdi = cpueMax > 0 ? sampleLocationCpue / cpueMax : 0

    const june = monthly.find((m) => m.month === 'June') || { catchKg: 0, trips: 0, cpue: 0 }

    const orderedPredictions = predictions
      .map((p) => ({ ...p, _d: new Date(p.date) }))
      .filter((p) => !Number.isNaN(p._d.getTime()))
      .sort((a, b) => a._d - b._d)
    const start = orderedPredictions[0]
    const end = orderedPredictions[orderedPredictions.length - 1]
    const D = start && end ? distanceKm(start, end) : 0
    const T = start && end ? (end._d.getTime() - start._d.getTime()) / (1000 * 60 * 60 * 24 * 30.4375) : 0
    const mpi = computeMigrationPatternIndex(D, T)

    const shelfPsl = 9
    const shelfAsl = 10
    const shelfAcc = computeShelfLifePredictionAccuracy(shelfPsl, shelfAsl)

    const catchMean = mean(monthlyCatch)
    const catchSd = standardDeviation(monthlyCatch)
    const catchCv = coefficientOfVariation(monthlyCatch)
    const cpueMean = mean(monthlyCpue)
    const cpueTrend = linearTrend(monthlyCpue)
    const catchTripCorr = pearsonCorrelation(monthlyCatch, monthlyTrips)
    const junePct = percentageContribution(june.catchKg, totalCatch)

    const groups = { NE: [], SW: [], IM: [] }
    for (const m of monthly) groups[seasonFromMonth(m.month)].push(m.cpue)
    const all = [...groups.NE, ...groups.SW, ...groups.IM]
    const grand = mean(all)
    const k = 3
    const n = all.length
    const ssb = Object.values(groups).reduce((s, g) => s + g.length * (mean(g) - grand) ** 2, 0)
    const ssw = Object.values(groups).reduce((s, g) => s + g.reduce((t, v) => t + (v - mean(g)) ** 2, 0), 0)
    const msb = ssb / (k - 1)
    const msw = ssw / (n - k)
    const f = msw > 0 ? msb / msw : 0

    const counts = { low: 0, medium: 0, high: 0 }
    for (const r of rows) counts[r.abundance_level] = (counts[r.abundance_level] || 0) + 1
    const expected = rows.length / 3
    const chiSquare = ['low', 'medium', 'high'].reduce((s, key) => s + ((counts[key] - expected) ** 2) / expected, 0)

    return {
      D, T, mpi,
      sampleLocationCpue, cpueMax, tdi,
      june,
      shelfPsl, shelfAsl, shelfAcc,
      totalCatch, catchMean, catchSd, catchCv, cpueMean, cpueTrend, catchTripCorr, junePct,
      msb, msw, f, counts, expected, chiSquare,
    }
  }, [dataset, monthOrder, predictions])

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Formula and Worked Solutions</h1>
        <p className="mt-2 text-sm text-slate-600 md:text-base">
          Step-by-step sample computations from SAPYAW dataset values.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">A. Migration Pattern</h2>
        <p className="text-sm text-slate-700">
          <code>MPI = </code>
          <Fraction numerator={<code>D</code>} denominator={<code>T</code>} />
        </p>
        <p className="text-sm text-slate-700">D = {computed.D.toFixed(4)} km, T = {computed.T.toFixed(4)} months</p>
        <p className="text-sm text-slate-700">
          <code>MPI = </code>
          <Fraction numerator={<code>{computed.D.toFixed(4)}</code>} denominator={<code>{computed.T.toFixed(4)}</code>} />
          <code> = {computed.mpi.toFixed(4)} km/month</code>
        </p>
        <div>
          <Link
            to="/migration-patterns?formula=migration"
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            View Migration Inputs on Migration Map
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">B. Intra-Annual Spatial Distribution</h2>
        <p className="text-sm text-slate-700">
          <code>TDI = </code>
          <Fraction numerator={<code>CPUE_location</code>} denominator={<code>CPUE_max</code>} />
        </p>
        <p className="text-sm text-slate-700">CPUE_location = {computed.sampleLocationCpue.toFixed(2)}, CPUE_max = {computed.cpueMax.toFixed(2)}</p>
        <p className="text-sm text-slate-700">
          <code>TDI = </code>
          <Fraction numerator={<code>{computed.sampleLocationCpue.toFixed(2)}</code>} denominator={<code>{computed.cpueMax.toFixed(2)}</code>} />
          <code> = {computed.tdi.toFixed(4)}</code>
        </p>
        <p className="text-sm text-slate-700">Equivalent percent: {(computed.tdi * 100).toFixed(2)}%</p>
        <div>
          <Link
            to="/distribution-maps?formula=tdi&year=2025&month=November&season=All&abundance=All&labels=1"
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            View TDI Inputs on Distribution Map
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">C. Catch Per Unit Effort (CPUE)</h2>
        <p className="text-sm text-slate-700">
          <code>CPUE = </code>
          <Fraction numerator={<code>C</code>} denominator={<code>F</code>} />
        </p>
        <p className="text-sm text-slate-700">June sample: C = {computed.june.catchKg.toFixed(0)} kg, F = {computed.june.trips.toFixed(0)} trips</p>
        <p className="text-sm text-slate-700">
          <code>CPUE = </code>
          <Fraction numerator={<code>{computed.june.catchKg.toFixed(0)}</code>} denominator={<code>{computed.june.trips.toFixed(0)}</code>} />
          <code> = {computeCpue(computed.june.catchKg, computed.june.trips).toFixed(2)} kg/trip</code>
        </p>
        <div>
          <Link
            to="/distribution-maps?formula=cpue&year=2025&month=June&season=All&abundance=All&labels=1"
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            View Exact CPUE Data on Distribution Map
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">D. Shelf-Life Prediction Accuracy</h2>
        <p className="text-sm text-slate-700">
          <code>S = (1 - </code>
          <Fraction numerator={<code>|PSL - ASL|</code>} denominator={<code>ASL</code>} />
          <code>) x 100</code>
        </p>
        <p className="text-sm text-slate-700">PSL = {computed.shelfPsl}, ASL = {computed.shelfAsl}</p>
        <p className="text-sm text-slate-700">
          <code>S = (1 - </code>
          <Fraction
            numerator={<code>|{computed.shelfPsl} - {computed.shelfAsl}|</code>}
            denominator={<code>{computed.shelfAsl}</code>}
          />
          <code>) x 100 = {(computed.shelfAcc ?? 0).toFixed(2)}%</code>
        </p>
        <div>
          <Link
            to="/distribution-maps?formula=shelfLife&year=2026&month=All&season=All&abundance=All"
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            View Shelf-Life Accuracy Context
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Statistical Treatment (SAPYAW Values)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">Mean Catch: <strong>{computed.catchMean.toFixed(2)}</strong></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">Catch SD: <strong>{computed.catchSd.toFixed(2)}</strong></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">Catch CV: <strong>{computed.catchCv.toFixed(2)}%</strong></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">Mean CPUE: <strong>{computed.cpueMean.toFixed(2)}</strong></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">Trend: <strong>Y = {computed.cpueTrend.intercept.toFixed(4)} + ({computed.cpueTrend.slope.toFixed(4)})X</strong></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">June Contribution: <strong>{computed.junePct.toFixed(2)}%</strong></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">Pearson r (catch vs effort): <strong>{computed.catchTripCorr.toFixed(4)}</strong></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">ANOVA F = <strong>{computed.f.toFixed(4)}</strong> (MSB={computed.msb.toFixed(4)}, MSW={computed.msw.toFixed(4)})</div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">Chi-square: <strong>{computed.chiSquare.toFixed(2)}</strong></div>
        </div>
        <div>
          <Link
            to="/charts-data?formula=stats"
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            View Statistical Inputs on Charts & Data
          </Link>
        </div>
      </div>
    </section>
  )
}
