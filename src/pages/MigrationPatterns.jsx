import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import { getCatchPoints, getPredictions, getBulanSeaSimulatedDataset } from '../services/dataService.js'
import { computeCpue, computeMigrationPatternIndex } from '../utils/statistics.js'

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

function isSegmentMarine(isMarine, startLat, startLng, endLat, endLng, samples) {
  const n = Math.max(2, Number(samples) || 0)
  for (let i = 0; i <= n; i += 1) {
    const t = i / n
    const lat = startLat + (endLat - startLat) * t
    const lng = startLng + (endLng - startLng) * t
    if (!isMarine(lat, lng)) return false
  }
  return true
}

function parseDate(value) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function zoneNameForLatLng(lat, lng) {
  // Very simple zone naming based on quadrant within the Bulan Sea bounds
  const centerLat = 12.66475
  const centerLng = 123.91
  const latOffset = lat - centerLat
  const lngOffset = lng - centerLng
  let zone = ''
  if (latOffset > 0.02) zone += 'North '
  else if (latOffset < -0.02) zone += 'South '
  else zone += 'Central '
  if (lngOffset > 0.03) zone += 'East'
  else if (lngOffset < -0.03) zone += 'West'
  else zone += 'Core'
  return `Bulan Sea – ${zone}`
}
  function distanceKm(a, b) {
  const R = 6371
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

const STAGE_CONFIG = {
  juvenile: {
    label: 'Juvenile Stage',
    color: 'emerald',
    year: '2025',
    season: 'Northeast Monsoon',
    months: ['November', 'December', 'January', 'February'],
    emoji: '🐟',
  },
  breeding: {
    label: 'Breeding Season',
    color: 'amber',
    year: '2026',
    season: 'Southwest Monsoon',
    months: ['May', 'June', 'July', 'August'],
    emoji: '🥚',
  },
  adult: {
    label: 'Adult Stage',
    color: 'blue',
    year: '2026',
    season: 'All',
    months: ['June', 'July', 'August', 'September'],
    emoji: '🐠',
  },
}

function buildFlowPoints(path, pointsPerSegment = 16) {
  if (!Array.isArray(path) || path.length < 2) return []
  const flow = []
  for (let i = 0; i < path.length - 1; i += 1) {
    const [sLat, sLng] = path[i]
    const [eLat, eLng] = path[i + 1]
    for (let step = 0; step < pointsPerSegment; step += 1) {
      const t = step / pointsPerSegment
      const lat = sLat + (eLat - sLat) * t
      const lng = sLng + (eLng - sLng) * t
      flow.push([lat, lng])
    }
  }
  return flow
}

function AnimatedMigrationFlow({ path }) {
  const [phase, setPhase] = useState(0)
  const frameRef = useRef(null)

  const flowPoints = useMemo(
    () => buildFlowPoints(path, 16),
    [path],
  )

  useEffect(() => {
    if (!flowPoints.length) return undefined

    const durationMs = 9000 // full loop duration
    const start = performance.now()

    const loop = () => {
      const now = performance.now()
      const elapsed = (now - start) % durationMs
      setPhase(elapsed / durationMs)
      frameRef.current = requestAnimationFrame(loop)
    }

    frameRef.current = requestAnimationFrame(loop)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [flowPoints.length])

  if (!flowPoints.length) return null

  const trailLength = 0.4 // fraction of full loop visible as a glowing trail

  return (
    <>
      {flowPoints.map((pt, idx) => {
        const pos = idx / flowPoints.length
        const rel = (pos - phase + 1) % 1
        if (rel > trailLength) return null

        const intensity = 1 - rel / trailLength
        const radius = 2 + 2.5 * intensity

        return (
          <CircleMarker
            key={idx}
            center={pt}
            radius={radius}
            pathOptions={{
              color: '#38bdf8',
              weight: 0,
              fillColor: '#38bdf8',
              fillOpacity: 0.6 * intensity + 0.2,
            }}
          />
        )
      })}
    </>
  )
}

function seasonForMonth(month) {
  const ne = ['November', 'December', 'January', 'February', 'March']
  const sw = ['May', 'June', 'July', 'August', 'September']
  if (ne.includes(month)) return 'Northeast Monsoon'
  if (sw.includes(month)) return 'Southwest Monsoon'
  return 'Inter-monsoon'
}

function getMonthName(dateStr) {
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const d = new Date(dateStr)
  return names[d.getMonth()]
}

function stageLabelForPrediction(p) {
  if (!p || !p.date) return null
  const month = getMonthName(p.date)

  // Explicit month-to-stage mapping so months are not shared
  const monthToStageKey = {
    November: 'juvenile',
    December: 'juvenile',
    January: 'juvenile',
    February: 'juvenile',
    May: 'breeding',
    April: 'breeding',
    June: 'adult',
    July: 'adult',
    August: 'adult',
    September: 'adult',
  }

  const stageKey = monthToStageKey[month]
  if (!stageKey || !STAGE_CONFIG[stageKey]) return null

  return STAGE_CONFIG[stageKey].label
}

export default function MigrationPatterns() {
  const [searchParams] = useSearchParams()
  const bulanSeaCenter = [12.66475, 123.8728889]
  const bulanSeaBounds = [
    [12.40, 123.55],
    [12.90, 124.20],
  ]
  const defaultZoom = 10
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

  const [predictions, setPredictions] = useState([])
  const [catchPoints, setCatchPoints] = useState([])
  const [dataset, setDataset] = useState(null)
  const [selectedStage, setSelectedStage] = useState(null)
  const [stageMonth, setStageMonth] = useState('All')

  useEffect(() => {
    let cancelled = false
    getPredictions().then((rows) => { if (!cancelled) setPredictions(Array.isArray(rows) ? rows : []) })
    getCatchPoints().then((rows) => { if (!cancelled) setCatchPoints(Array.isArray(rows) ? rows : []) })
    getBulanSeaSimulatedDataset().then((d) => { if (!cancelled) setDataset(d || null) })
    return () => { cancelled = true }
  }, [])

  const orderedPredictions = useMemo(() => {
    const filtered = predictions.filter((p) => isMarine(p.lat + latOffset, p.lng + lngOffset))
    return filtered
      .map((p) => {
        const _d = parseDate(p.date)
        const _stageLabel = stageLabelForPrediction(p)
        return _stageLabel ? { ...p, _d, _stageLabel } : null
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (!a._d && !b._d) return 0
        if (!a._d) return 1
        if (!b._d) return -1
        return a._d - b._d
      })
  }, [predictions, isMarine, latOffset, lngOffset])

  const path = useMemo(
    () => {
      const points = orderedPredictions.map((p) => [p.lat + latOffset, p.lng + lngOffset])
      // Only include segment if both endpoints are marine and the line stays marine
      const filtered = []
      for (let i = 0; i < points.length - 1; i += 1) {
        const [sLat, sLng] = points[i]
        const [eLat, eLng] = points[i + 1]
        if (isMarine(sLat, sLng) && isMarine(eLat, eLng) && isSegmentMarine(isMarine, sLat, sLng, eLat, eLng, 16)) {
          filtered.push([sLat, sLng])
          if (i === points.length - 2) filtered.push([eLat, eLng])
        }
      }
      return filtered
    },
    [orderedPredictions, isMarine, latOffset, lngOffset],
  )

  const pathDistanceKm = useMemo(() => {
    if (path.length < 2) return 0
    let sum = 0
    for (let i = 1; i < path.length; i++) sum += distanceKm(path[i - 1], path[i])
    return sum
  }, [path])

  const migrationTimeMonths = useMemo(() => {
    if (orderedPredictions.length < 2) return 0
    const start = orderedPredictions[0]?._d
    const end = orderedPredictions[orderedPredictions.length - 1]?._d
    if (!start || !end) return 0
    const elapsedMs = end.getTime() - start.getTime()
    return Math.max(0, elapsedMs / (1000 * 60 * 60 * 24 * 30.4375))
  }, [orderedPredictions])

  const migrationPatternIndex = useMemo(
    () => computeMigrationPatternIndex(pathDistanceKm, migrationTimeMonths),
    [pathDistanceKm, migrationTimeMonths],
  )

  const overallCpue = useMemo(() => {
    const catchKg = catchPoints.reduce((s, r) => s + (Number(r.catchKg) || 0), 0)
    const effortHours = catchPoints.reduce((s, r) => s + (Number(r.effortHours) || 0), 0)
    return computeCpue(catchKg, effortHours)
  }, [catchPoints])

  // Stage map filtered data
  const stageCatch = useMemo(() => {
    if (!selectedStage) return []
    const cfg = STAGE_CONFIG[selectedStage]
    return catchPoints.filter((r) => {
      if (!r.date.startsWith(cfg.year)) return false
      const month = getMonthName(r.date)
      if (stageMonth !== 'All' && month !== stageMonth) return false
      if (cfg.season !== 'All' && seasonForMonth(month) !== cfg.season) return false
      return isMarine(r.lat + latOffset, r.lng + lngOffset)
    })
  }, [selectedStage, stageMonth, catchPoints, isMarine, latOffset, lngOffset])

  const stagePredictions = useMemo(() => {
    if (!selectedStage) return []
    const cfg = STAGE_CONFIG[selectedStage]
    return predictions.filter((p) => {
      if (!p.date.startsWith(cfg.year)) return false
      const month = getMonthName(p.date)
      if (stageMonth !== 'All' && month !== stageMonth) return false
      if (cfg.season !== 'All' && seasonForMonth(month) !== cfg.season) return false
      return isMarine(p.lat + latOffset, p.lng + lngOffset)
    })
  }, [selectedStage, stageMonth, predictions, isMarine, latOffset, lngOffset])

  const stagePath = useMemo(() => {
    if (!selectedStage || !stagePredictions.length) return []
    const ordered = [...stagePredictions].sort((a, b) => {
      const ad = parseDate(a.date)
      const bd = parseDate(b.date)
      if (!ad && !bd) return 0
      if (!ad) return 1
      if (!bd) return -1
      return ad - bd
    })
    const points = ordered.map((p) => [p.lat + latOffset, p.lng + lngOffset])
    const filtered = []
    for (let i = 0; i < points.length - 1; i += 1) {
      const [sLat, sLng] = points[i]
      const [eLat, eLng] = points[i + 1]
      if (isMarine(sLat, sLng) && isMarine(eLat, eLng) && isSegmentMarine(isMarine, sLat, sLng, eLat, eLng, 16)) {
        filtered.push([sLat, sLng])
        if (i === points.length - 2) filtered.push([eLat, eLng])
      }
    }
    return filtered
  }, [selectedStage, stagePredictions, isMarine, latOffset, lngOffset])

  const stageHotspots = useMemo(() => dataset?.hotspots ?? [], [dataset])

  const stageStats = useMemo(() => {
    const totalCatch = stageCatch.reduce((s, r) => s + (Number(r.catchKg) || 0), 0)
    const totalEffort = stageCatch.reduce((s, r) => s + (Number(r.effortHours) || 6), 0)
    const cpue = computeCpue(totalCatch, totalEffort).toFixed(2)
    return { totalCatch: Math.round(totalCatch), cpue, records: stageCatch.length, hotspots: stageHotspots.length }
  }, [stageCatch, stageHotspots])

  const overallStageCounts = useMemo(() => {
    const counts = { juvenile: 0, breeding: 0, adult: 0 }
    orderedPredictions.forEach((p) => {
      if (!p._stageLabel) return
      if (p._stageLabel === STAGE_CONFIG.juvenile.label) counts.juvenile += 1
      else if (p._stageLabel === STAGE_CONFIG.breeding.label) counts.breeding += 1
      else if (p._stageLabel === STAGE_CONFIG.adult.label) counts.adult += 1
    })
    return counts
  }, [orderedPredictions])

  const migrationFormulaContext = useMemo(() => {
    if (searchParams.get('formula') !== 'migration') return null
    return {
      D: pathDistanceKm,
      T: migrationTimeMonths,
      MPI: migrationPatternIndex,
      points: orderedPredictions.length,
    }
  }, [searchParams, pathDistanceKm, migrationTimeMonths, migrationPatternIndex, orderedPredictions.length])

  return (
    <section className="space-y-6">
      {migrationFormulaContext && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="text-sm font-semibold text-blue-900">Migration Formula Context</div>
          <div className="mt-1 text-sm text-blue-800">
            D = {migrationFormulaContext.D.toFixed(4)} km, T = {migrationFormulaContext.T.toFixed(4)} months, points = {migrationFormulaContext.points}
          </div>
          <div className="mt-1 text-sm text-blue-900">
            MPI = D/T = {migrationFormulaContext.D.toFixed(4)}/{migrationFormulaContext.T.toFixed(4)} = {migrationFormulaContext.MPI.toFixed(4)} km/month
          </div>
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Migration Patterns</h1>
        <p className="mt-2 text-sm text-slate-600 md:text-base">
          Skipjack tuna migration pathways and movement patterns in Bulan Sea.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Migration Path Map</h2>
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
              <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              <span className="text-sm font-medium text-blue-900">
                {!selectedStage ? `${path.length} points (overall)` : `${stageCatch.length} catch · ${stagePredictions.length} predictions`}
              </span>
            </div>
          </div>

          {/* Stage filter controls */}
          <div className="mb-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
              <span className="font-semibold text-slate-700 mr-1">View pattern for:</span>
              <button
                type="button"
                onClick={() => { setSelectedStage(null); setStageMonth('All') }}
                className={`rounded-full px-3 py-1.5 font-semibold border transition-colors ${
                  !selectedStage
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Overall migration
              </button>
              <button
                type="button"
                onClick={() => { setSelectedStage('juvenile'); setStageMonth('All') }}
                className={`rounded-full px-3 py-1.5 font-semibold border transition-colors flex items-center gap-1 ${
                  selectedStage === 'juvenile'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span>J</span>
                <span>Juvenile</span>
              </button>
              <button
                type="button"
                onClick={() => { setSelectedStage('breeding'); setStageMonth('All') }}
                className={`rounded-full px-3 py-1.5 font-semibold border transition-colors flex items-center gap-1 ${
                  selectedStage === 'breeding'
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span>B</span>
                <span>Breeding</span>
              </button>
              <button
                type="button"
                onClick={() => { setSelectedStage('adult'); setStageMonth('All') }}
                className={`rounded-full px-3 py-1.5 font-semibold border transition-colors flex items-center gap-1 ${
                  selectedStage === 'adult'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span>A</span>
                <span>Adult</span>
              </button>
            </div>

            {/* Overall stage composition indicators */}
            {!selectedStage && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">Overall includes:</span>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span>Juvenile ({overallStageCounts.juvenile})</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span>Breeding ({overallStageCounts.breeding})</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  <span>Adult ({overallStageCounts.adult})</span>
                </div>
              </div>
            )}
          </div>

          {/* Stage stats summary when filtered */}
          {selectedStage && (
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px] sm:text-xs">
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="font-semibold text-slate-500">Total Catch</p>
                <p className="text-sm font-bold text-slate-900">{stageStats.totalCatch} kg</p>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="font-semibold text-slate-500">Mean CPUE</p>
                <p className="text-sm font-bold text-slate-900">{stageStats.cpue}</p>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="font-semibold text-slate-500">Catch Records</p>
                <p className="text-sm font-bold text-slate-900">{stageStats.records}</p>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="font-semibold text-slate-500">Hotspots</p>
                <p className="text-sm font-bold text-slate-900">{stageStats.hotspots}</p>
              </div>
            </div>
          )}

          <div className="h-[400px] w-full overflow-hidden rounded-lg border border-slate-200 bg-white md:h-[520px]">
            <MapContainer
              center={bulanSeaCenter}
              zoom={defaultZoom}
              minZoom={defaultZoom}
              maxZoom={18}
              maxBounds={bulanSeaBounds}
              maxBoundsViscosity={1.0}
              scrollWheelZoom
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Overall migration view */}
              {!selectedStage && path.length >= 2 && (
                <>
                  <Polyline positions={path} pathOptions={{ color: '#1d4ed8', weight: 3, opacity: 0.5 }} />
                  <AnimatedMigrationFlow path={path} />
                </>
              )}

              {!selectedStage &&
                orderedPredictions.map((p, idx) => (
                  <CircleMarker
                    key={p.id}
                    center={[p.lat + latOffset, p.lng + lngOffset]}
                    radius={idx === 0 ? 8 : 6}
                    pathOptions={{
                      color: '#0f172a',
                      weight: 1,
                      fillColor: idx === 0 ? '#16a34a' : '#2563eb',
                      fillOpacity: 0.85,
                    }}
                  >
                    <Tooltip direction="top">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-xs">Migration point</div>
                        <div className="text-[11px]">Stage: {p._stageLabel}</div>
                        {p.date && <div className="text-[11px] text-slate-600">Date: {p.date}</div>}
                      </div>
                    </Tooltip>
                  </CircleMarker>
                ))}

              {/* Life-stage-specific circulation view */}
              {selectedStage && (
                <>
                  {/* Stage-specific migration flow */}
                  {stagePath.length >= 2 && (
                    <>
                      <Polyline positions={stagePath} pathOptions={{ color: '#0f766e', weight: 3, opacity: 0.6 }} />
                      <AnimatedMigrationFlow path={stagePath} />
                    </>
                  )}

                  {/* Hotspots */}
                  {stageHotspots.map(
                    (h) =>
                      isMarine(h.center_lat + latOffset, h.center_lng + lngOffset) && (
                        <Circle
                          key={h.id}
                          center={[h.center_lat + latOffset, h.center_lng + lngOffset]}
                          radius={(h.radius_km || 5) * 1000}
                          pathOptions={{ color: '#06b6d4', weight: 1, fillColor: '#06b6d4', fillOpacity: 0.18 }}
                        />
                      ),
                  )}

                  {/* Catch points */}
                  {stageCatch.map((r) => (
                    <CircleMarker
                      key={r.id}
                      center={[r.lat + latOffset, r.lng + lngOffset]}
                      radius={6}
                      pathOptions={{ color: '#f59e0b', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.75 }}
                    />
                  ))}

                  {/* Predictions */}
                  {stagePredictions.map((p) => (
                    <CircleMarker
                      key={p.id}
                      center={[p.lat + latOffset, p.lng + lngOffset]}
                      radius={7}
                      pathOptions={{
                        color: '#7c3aed',
                        weight: 2,
                        fillColor: '#a78bfa',
                        fillOpacity: 0.35,
                        dashArray: '4 4',
                      }}
                    >
                      <Tooltip direction="top">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-xs">Prediction point</div>
                          <div className="text-[11px]">
                            Stage: {STAGE_CONFIG[selectedStage]?.label || 'Selected stage'}
                          </div>
                          {p.date && <div className="text-[11px] text-slate-600">Date: {p.date}</div>}
                        </div>
                      </Tooltip>
                    </CircleMarker>
                  ))}
                </>
              )}
            </MapContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Summary Statistics</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-blue-50 p-3">
                <span className="text-sm font-medium text-slate-700">Prediction points</span>
                <span className="text-lg font-bold text-blue-700">{predictions.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-green-50 p-3">
                <span className="text-sm font-medium text-slate-700">Path distance</span>
                <span className="text-lg font-bold text-green-700">{pathDistanceKm.toFixed(1)} km</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-cyan-50 p-3">
                <span className="text-sm font-medium text-slate-700">Time interval</span>
                <span className="text-lg font-bold text-cyan-700">{migrationTimeMonths.toFixed(2)} mo</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-indigo-50 p-3">
                <span className="text-sm font-medium text-slate-700">Migration Pattern Index</span>
                <span className="text-lg font-bold text-indigo-700">{migrationPatternIndex.toFixed(2)} km/mo</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-purple-50 p-3">
                <span className="text-sm font-medium text-slate-700">Catch records</span>
                <span className="text-lg font-bold text-purple-700">{catchPoints.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3">
                <span className="text-sm font-medium text-slate-700">Overall CPUE</span>
                <span className="text-lg font-bold text-amber-700">{overallCpue.toFixed(2)} kg/hr</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Path Points</h2>
            <p className="mt-1 text-sm text-slate-600">Ordered by date</p>
            <div className="mt-4 max-h-[400px] overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Zone</th>
                    <th className="px-4 py-3 font-semibold">Suitability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {orderedPredictions.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">{p.date || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{zoneNameForLatLng(p.lat, p.lng)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{Number(p.suitability).toFixed(2)}</td>
                    </tr>
                  ))}
                  {!orderedPredictions.length && (
                    <tr>
                      <td className="px-4 py-6 text-center text-slate-500" colSpan={3}>
                        No prediction points available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Life Stage Location Variation */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">How Location Varies Across Life Stages</h2>
        <p className="mt-1 text-sm text-slate-600">
          Skipjack tuna (<em>Katsuwonus pelamis</em>) exhibit distinct spatial distribution patterns in the Bulan Sea
          depending on their life stage — driven by growth requirements, habitat preference, and reproductive behavior.
        </p>

        <div className="mt-6 grid gap-5 md:grid-cols-3">

          {/* Juvenile Stage */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white text-lg font-bold shrink-0">J</span>
              <div>
                <h3 className="text-base font-bold text-emerald-900">Juvenile Stage</h3>
                <p className="text-xs text-emerald-700">~0–40 cm fork length · Ages 0–1 yr</p>
              </div>
            </div>
            <div className="space-y-3 text-sm text-slate-700">
              <div>
                <p className="font-semibold text-emerald-800 mb-1">📍 Location</p>
                <p>Concentrated in nearshore and shallow coastal waters of the Bulan Sea, particularly along the
                eastern coastline of Bulan, Sorsogon. They remain in <strong>inshore feeding grounds</strong> (depths 20–80 m)
                where prey density is highest.</p>
              </div>
              <div>
                <p className="font-semibold text-emerald-800 mb-1">🌱 Growth</p>
                <p>Rapid growth phase — juveniles gain up to <strong>2–3 cm per month</strong>. They school tightly in
                warm surface waters (28–30°C SST) rich in zooplankton and small baitfish. High chlorophyll-a zones
                near river outflows attract dense juvenile aggregations.</p>
              </div>
              <div>
                <p className="font-semibold text-emerald-800 mb-1">🐟 Habitat</p>
                <p>Prefer shallow reef edges and aggregation device (FAD) areas. In Bulan Sea, juvenile schools are
                frequently observed near the <strong>San Jacinto and Monreal channel margins</strong> during the
                Northeast Monsoon (November–February) when cooler upwelled nutrients support high prey availability.</p>
              </div>
              <div>
                <p className="font-semibold text-emerald-800 mb-1">🔬 Reproductive Behavior</p>
                <p>Sexually immature. No spawning activity. Movement is primarily driven by <strong>prey tracking</strong>
                and predator avoidance rather than reproductive cues.</p>
              </div>
            </div>
          </div>

          {/* Breeding Season */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white text-lg font-bold shrink-0">B</span>
              <div>
                <h3 className="text-base font-bold text-amber-900">Breeding Season</h3>
                <p className="text-xs text-amber-700">~40–55 cm fork length · Ages 1–2 yr</p>
              </div>
            </div>
            <div className="space-y-3 text-sm text-slate-700">
              <div>
                <p className="font-semibold text-amber-800 mb-1">📍 Location</p>
                <p>Shift toward <strong>offshore and mid-water column areas</strong> (40–150 m depth) in the central
                Bulan Sea. During peak spawning months (May–August, Southwest Monsoon), schools disperse toward
                the open waters between Ticao Island and the Bulan coastline.</p>
              </div>
              <div>
                <p className="font-semibold text-amber-800 mb-1">🌱 Growth</p>
                <p>Growth rate slows as energy is redirected toward <strong>gonadal development</strong>. SST
                preference shifts to 26–29°C. Fish begin exhibiting <strong>diel vertical migration</strong> —
                ascending to surface at night and descending during the day.</p>
              </div>
              <div>
                <p className="font-semibold text-amber-800 mb-1">🐟 Habitat</p>
                <p>Actively seek <strong>thermocline edges</strong> (boundary between warm surface and cooler deep
                water). In Bulan Sea, the inter-monsoon transition period (April–May) triggers aggregation near
                the <strong>North Core zone</strong> where upwelling creates favorable spawning conditions.</p>
              </div>
              <div>
                <p className="font-semibold text-amber-800 mb-1">🔬 Reproductive Behavior</p>
                <p>Skipjack are <strong>batch spawners</strong> — releasing eggs multiple times per season.
                Females release 80,000–2 million eggs per batch. Spawning peaks at SST 26–30°C with low salinity
                gradients. Schools temporarily <strong>break into smaller spawning groups</strong> and relocate
                to calmer offshore zones away from heavy fishing pressure.</p>
              </div>
            </div>
          </div>

          {/* Adult Stage */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white text-lg font-bold shrink-0">A</span>
              <div>
                <h3 className="text-base font-bold text-blue-900">Adult Stage</h3>
                <p className="text-xs text-blue-700">&gt;55 cm fork length · Ages 2+ yr</p>
              </div>
            </div>
            <div className="space-y-3 text-sm text-slate-700">
              <div>
                <p className="font-semibold text-blue-800 mb-1">📍 Location</p>
                <p>Range across the <strong>entire Bulan Sea and beyond</strong> into the Sibuyan Sea and
                Philippine Sea corridors. Adults are highly migratory — their location is driven by
                seasonal prey availability, SST gradients, and ocean current shifts associated with
                monsoon transitions.</p>
              </div>
              <div>
                <p className="font-semibold text-blue-800 mb-1">🌱 Growth</p>
                <p>Growth plateaus at maximum fork length (~85 cm). Adults maintain body condition by following
                <strong> high-CPUE foraging fronts</strong>. In Bulan Sea, peak adult biomass concentrates
                during June–August (Southwest Monsoon peak) when SST and chlorophyll conditions are most
                productive in the Central Core and North zones.</p>
              </div>
              <div>
                <p className="font-semibold text-blue-800 mb-1">🐟 Habitat</p>
                <p>Occupy <strong>epipelagic zones</strong> (0–200 m). Strongly associated with
                oceanographic features — surface temperature fronts, chlorophyll blooms, and current
                convergence zones. In Bulan Sea, adults are frequently caught in the
                <strong> Central East and Central Core zones</strong> near the deepest channel sections
                during the high-catch months of June–September.</p>
              </div>
              <div>
                <p className="font-semibold text-blue-800 mb-1">🔬 Reproductive Behavior</p>
                <p>Adults are <strong>repeat batch spawners</strong> capable of spawning year-round in
                tropical waters. Post-spawning adults rapidly recover condition and re-enter feeding
                aggregations. Large adult schools become <strong>predictable and targetable</strong> by
                fishers using ringnet and handline gear — explaining the high catch volumes recorded
                in Bulan Sea during June–August.</p>
              </div>
            </div>
          </div>

        </div>

        {/* Comparative summary table */}
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold">Attribute</th>
                <th className="px-4 py-3 font-semibold text-emerald-700">Juvenile</th>
                <th className="px-4 py-3 font-semibold text-amber-700">Breeding</th>
                <th className="px-4 py-3 font-semibold text-blue-700">Adult</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {[
                ['Fork Length', '0–40 cm', '40–55 cm', '>55 cm'],
                ['Preferred Depth', '20–80 m', '40–150 m', '0–200 m'],
                ['SST Preference', '28–30°C', '26–29°C', '24–30°C'],
                ['Location Zone', 'Nearshore / Inshore', 'Central / Offshore', 'Whole sea & beyond'],
                ['Peak Months (Bulan Sea)', 'Nov–Feb', 'Apr–Aug', 'Jun–Sep'],
                ['Movement Driver', 'Prey & safety', 'Spawning cues', 'Foraging fronts'],
                ['Schooling Behavior', 'Tight, large schools', 'Smaller spawn groups', 'Large mobile schools'],
                ['Fishing Vulnerability', 'Low (inshore)', 'Moderate', 'High (ringnet / handline)'],
              ].map(([attr, j, b, a]) => (
                <tr key={attr} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{attr}</td>
                  <td className="px-4 py-3 text-slate-700">{j}</td>
                  <td className="px-4 py-3 text-slate-700">{b}</td>
                  <td className="px-4 py-3 text-slate-700">{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </section>
  )
}
