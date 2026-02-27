import { useEffect, useMemo, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer } from 'react-leaflet'
import { getBulanSeaSimulatedDataset, getCatchPointsByYear, getEnvironmentalParamsByYear, getPredictionsByYear } from '../services/dataService.js'

function abundanceColor(level) {
  if (level === 'high') return '#16a34a'
  if (level === 'medium') return '#f59e0b'
  return '#ef4444'
}

function clamp(min, max, v) {
  return Math.max(min, Math.min(max, v))
}

function seasonForMonth(month) {
  const m = String(month).toLowerCase()
  if (['december', 'january', 'february'].includes(m)) return 'Northeast Monsoon'
  if (['june', 'july', 'august'].includes(m)) return 'Southwest Monsoon'
  return 'Inter-monsoon'
}

function getMonthFromDate(date) {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  const dateObj = new Date(date)
  return monthNames[dateObj.getMonth()]
}

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

function metersPerDegLngAtLat(lat) {
  return 111320 * Math.cos((lat * Math.PI) / 180)
}

function offsetLatLngByMeters(lat, lng, northMeters, eastMeters) {
  const dLat = northMeters / 111320
  const dLng = eastMeters / (metersPerDegLngAtLat(lat) || 1)
  return [lat + dLat, lng + dLng]
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

function safeMarineCircleRadiusMeters(isMarine, centerLat, centerLng, radiusMeters) {
  const r0 = Math.max(0, Number(radiusMeters) || 0)
  if (r0 <= 0) return 0
  if (!isMarine(centerLat, centerLng)) return 0

  const angles = 24
  const perimeterOk = (r) => {
    for (let i = 0; i < angles; i += 1) {
      const a = (i / angles) * Math.PI * 2
      const north = Math.cos(a) * r
      const east = Math.sin(a) * r
      const [lat, lng] = offsetLatLngByMeters(centerLat, centerLng, north, east)
      if (!isMarine(lat, lng)) return false
    }
    return true
  }

  if (perimeterOk(r0)) return r0

  let lo = 0
  let hi = r0
  for (let iter = 0; iter < 12; iter += 1) {
    const mid = (lo + hi) / 2
    if (perimeterOk(mid)) lo = mid
    else hi = mid
  }
  return lo
}

export default function DistributionMaps() {
  const latOffset = -0.02
  const lngOffset = -0.03
  const hotspotRadiusScale = 0.6

  const marinePolygon = useMemo(() => {
    // Rough Bulan Sea marine mask (water corridor) in [lng, lat] order.
    // This is used only as a spatial constraint to prevent rendering on land.
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

  const bulanSeaCenter = [12.66475 + latOffset, 123.91 + lngOffset]
  const bulanSeaBounds = [
    [12.56 + latOffset, 123.70 + lngOffset],
    [12.78 + latOffset, 124.00 + lngOffset],
  ]
  const defaultZoom = 11

  const [dataset, setDataset] = useState(null)

  const [selectedYear, setSelectedYear] = useState('2026')
  const [selectedMonth, setSelectedMonth] = useState('All')
  const [selectedSeason, setSelectedSeason] = useState('All')
  const [selectedAbundance, setSelectedAbundance] = useState('All')

  const [showCatch, setShowCatch] = useState(true)
  const [showHotspots, setShowHotspots] = useState(true)
  const [showMigration, setShowMigration] = useState(true)
  const [showPredictions, setShowPredictions] = useState(false)

  // Mobile panel visibility states
  const [showFiltersPanel, setShowFiltersPanel] = useState(false)
  const [showInsightsPanel, setShowInsightsPanel] = useState(false)

  // Data states for different years
  const [catchData2025, setCatchData2025] = useState([])
  const [catchData2026, setCatchData2026] = useState([])
  const [envData2025, setEnvData2025] = useState([])
  const [envData2026, setEnvData2026] = useState([])
  const [predictions2026, setPredictions2026] = useState([])

  useEffect(() => {
    let cancelled = false
    
    // Load simulated dataset for hotspots and migration
    getBulanSeaSimulatedDataset().then((data) => {
      if (cancelled) return
      setDataset(data || null)
    })

    // Load data for different years
    const loadYearlyData = async () => {
      try {
        const [catch2025, catch2026, env2025, env2026, preds2026] = await Promise.all([
          getCatchPointsByYear('2025'),
          getCatchPointsByYear('2026'),
          getEnvironmentalParamsByYear('2025'),
          getEnvironmentalParamsByYear('2026'),
          getPredictionsByYear('2026')
        ])
        
        if (!cancelled) {
          setCatchData2025(catch2025 || [])
          setCatchData2026(catch2026 || [])
          setEnvData2025(env2025 || [])
          setEnvData2026(env2026 || [])
          setPredictions2026(preds2026 || [])
        }
      } catch (error) {
        console.error('Error loading yearly data:', error)
      }
    }

    loadYearlyData()
    
    return () => {
      cancelled = true
    }
  }, [])

  const catchLocations = useMemo(() => {
    return selectedYear === '2025' ? catchData2025 : catchData2026
  }, [selectedYear, catchData2025, catchData2026])
  
  const hotspots = useMemo(() => dataset?.hotspots ?? [], [dataset])
  const migrationPaths = useMemo(() => dataset?.migration_paths ?? [], [dataset])
  const predictions = useMemo(() => selectedYear === '2026' ? predictions2026 : [], [selectedYear, predictions2026])

  const allMonths = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ]
  const monthOptions = ['All', ...allMonths]

  const seasons = ['All', 'Northeast Monsoon', 'Southwest Monsoon', 'Inter-monsoon']
  const abundances = ['All', 'low', 'medium', 'high']

  const filteredCatch = useMemo(() => {
    return catchLocations.filter((r) => {
      const month = getMonthFromDate(r.date)
      if (selectedMonth !== 'All' && month !== selectedMonth) return false
      const season = seasonForMonth(month)
      if (selectedSeason !== 'All' && season !== selectedSeason) return false
      if (selectedAbundance !== 'All' && r.abundance_level !== selectedAbundance) return false
      if (!isMarine(r.lat + latOffset, r.lng + lngOffset)) return false
      return true
    })
  }, [catchLocations, selectedMonth, selectedSeason, selectedAbundance, isMarine, latOffset, lngOffset])

  const filteredHotspots = useMemo(() => {
    return hotspots.filter((h) => {
      if (selectedMonth !== 'All' && h.peak_month !== selectedMonth) return false
      if (selectedSeason !== 'All' && seasonForMonth(h.peak_month) !== selectedSeason) return false
      if (!isMarine(h.center_lat + latOffset, h.center_lng + lngOffset)) return false
      return true
    })
  }, [hotspots, selectedMonth, selectedSeason, isMarine, latOffset, lngOffset])

  const filteredMigration = useMemo(() => {
    return migrationPaths.filter((m) => {
      if (selectedMonth !== 'All' && !m.months_active?.includes(selectedMonth)) return false
      if (selectedSeason !== 'All') {
        const anyInSeason = (m.months_active || []).some((mm) => seasonForMonth(mm) === selectedSeason)
        if (!anyInSeason) return false
      }
      const sLat = m.start_lat + latOffset
      const sLng = m.start_lng + lngOffset
      const eLat = m.end_lat + latOffset
      const eLng = m.end_lng + lngOffset
      if (!isMarine(sLat, sLng)) return false
      if (!isMarine(eLat, eLng)) return false
      if (!isSegmentMarine(isMarine, sLat, sLng, eLat, eLng, 32)) return false
      return true
    })
  }, [migrationPaths, selectedMonth, selectedSeason, isMarine, latOffset, lngOffset])

  const filteredPredictions = useMemo(() => {
    return predictions.filter((p) => {
      const month = getMonthFromDate(p.date)
      if (selectedMonth !== 'All' && month !== selectedMonth) return false
      if (!isMarine(p.lat + latOffset, p.lng + lngOffset)) return false
      return true
    })
  }, [predictions, selectedMonth, isMarine, latOffset, lngOffset])

  const stats = useMemo(() => {
    const totalCatch = filteredCatch.reduce((s, r) => s + (Number(r.catchKg) || 0), 0)
    const totalTrips = filteredCatch.reduce((s, r) => s + (Number(r.effortHours || 6) / 6), 0)
    const meanCpue = filteredCatch.length
      ? filteredCatch.reduce((s, r) => s + (Number(r.catchKg || 0) / (Number(r.effortHours || 6))), 0) / filteredCatch.length
      : 0
    const dominantZone = filteredHotspots[0]
      ? 'Hotspot-focused'
      : filteredCatch.length
        ? 'Catch cluster'
        : '—'

    return {
      totalCatchKg: Math.round(totalCatch),
      meanCpue: meanCpue.toFixed(2),
      trips: totalTrips,
      hotspots: filteredHotspots.length,
      dominantZone,
    }
  }, [filteredCatch, filteredHotspots])

  const cpueP95 = useMemo(() => {
    const values = filteredCatch
      .map((r) => Number(r.catchKg || 0) / Number(r.effortHours || 6))
      .filter((v) => v > 0)
      .sort((a, b) => a - b)
    if (!values.length) return 1
    const idx = Math.floor(values.length * 0.95) - 1
    return values[clamp(0, values.length - 1, idx)] || values[values.length - 1] || 1
  }, [filteredCatch])

  return (
    <section className="border border-slate-300 bg-white shadow-sm">
      <div className="border-b border-slate-300 p-4">
        <h1 className="text-xl font-semibold text-slate-900">Distribution Maps</h1>
        <p className="mt-1 text-[12px] text-slate-700">
          Fisheries intelligence view for intra-annual distribution (simulated research data).
        </p>
      </div>

      {/* Legend — mobile only, below header */}
      <div className="sm:hidden border-b border-slate-200 px-4 py-3">
        <div className="text-[11px] font-semibold text-slate-800 mb-2">Legend</div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-slate-700">
          <div className="flex items-center gap-1 font-semibold text-slate-600 text-[11px] w-full">Catch points (CPUE)</div>
          <div className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ background: '#ef4444' }} /><span>Low</span></div>
          <div className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ background: '#f59e0b' }} /><span>Medium</span></div>
          <div className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ background: '#16a34a' }} /><span>High</span></div>
          <div className="flex items-center gap-1 font-semibold text-slate-600 text-[11px] w-full mt-1">Hotspots / Migration / Predictions</div>
          <div className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm shrink-0" style={{ background: '#06b6d4', opacity: 0.55 }} /><span>Hotspot zone</span></div>
          <div className="flex items-center gap-1"><span className="inline-block h-[2px] w-5 shrink-0" style={{ background: '#2563eb' }} /><span>Migration</span></div>
          <div className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full border shrink-0" style={{ borderColor: '#7c3aed', background: '#a78bfa', opacity: 0.55 }} /><span>Prediction</span></div>
        </div>
      </div>

      <div className="p-4">
        <div className="rounded-sm border border-slate-300 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold text-slate-900">Bulan Sea Intelligence Map</h2>
            <div className="text-[11px] text-slate-600">
              {selectedMonth} • {selectedSeason} • {selectedAbundance}
            </div>
          </div>

          <div className="relative h-[680px] w-full overflow-hidden rounded-sm border border-slate-300 bg-white">
            <MapContainer
              center={bulanSeaCenter}
              zoom={defaultZoom}
              minZoom={defaultZoom}
              maxZoom={18}
              maxBounds={bulanSeaBounds}
              maxBoundsViscosity={1.0}
              scrollWheelZoom
              style={{ height: '100%', width: '100%', zIndex: 0 }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {showHotspots &&
                filteredHotspots.map((h) => (
                  (() => {
                    const cLat = h.center_lat + latOffset
                    const cLng = h.center_lng + lngOffset
                    const rMeters = h.radius_km * hotspotRadiusScale * 1000
                    const safeRadius = safeMarineCircleRadiusMeters(isMarine, cLat, cLng, rMeters)
                    if (safeRadius <= 0) return null
                    return (
                      <Circle
                        key={h.id}
                        center={[cLat, cLng]}
                        radius={safeRadius}
                        pathOptions={{
                          color: '#0891b2',
                          weight: 2,
                          fillColor: '#06b6d4',
                          fillOpacity: 0.18,
                        }}
                      />
                    )
                  })()
                ))}

              {showMigration &&
                filteredMigration.map((m) => (
                  <Polyline
                    key={m.id}
                    positions={[
                      [m.start_lat + latOffset, m.start_lng + lngOffset],
                      [m.end_lat + latOffset, m.end_lng + lngOffset],
                    ]}
                    pathOptions={{
                      color: '#2563eb',
                      weight: m.migration_type === 'long' ? 5 : m.migration_type === 'medium' ? 4 : 3,
                      opacity: 0.85,
                      dashArray: m.migration_type === 'short' ? '0' : m.migration_type === 'medium' ? '6 6' : '10 8',
                    }}
                  />
                ))}

              {showMigration &&
                filteredMigration.map((m) => (
                  <CircleMarker
                    key={`${m.id}-end`}
                    center={[m.end_lat + latOffset, m.end_lng + lngOffset]}
                    radius={5}
                    pathOptions={{
                      color: '#1e40af',
                      weight: 2,
                      fillColor: '#1e40af',
                      fillOpacity: 0.9,
                    }}
                  />
                ))}

              {showCatch &&
                filteredCatch.map((r) => {
                  const cpue = Number(r.catchKg || 0) / Number(r.effortHours || 6)
                  const radius = clamp(4, 12, 4 + (cpue / (cpueP95 || 1)) * 8)
                  const c = abundanceColor('medium') // Default to medium for now
                  return (
                    <CircleMarker
                      key={r.id}
                      center={[r.lat + latOffset, r.lng + lngOffset]}
                      radius={radius}
                      pathOptions={{
                        color: c,
                        weight: 2,
                        fillColor: c,
                        fillOpacity: 0.3,
                      }}
                    />
                  )
                })}

              {showPredictions &&
                filteredPredictions.map((p) => (
                  <CircleMarker
                    key={p.id}
                    center={[p.lat + latOffset, p.lng + lngOffset]}
                    radius={7}
                    pathOptions={{
                      color: '#7c3aed',
                      weight: 2,
                      fillColor: '#a78bfa',
                      fillOpacity: 0.18,
                      dashArray: '5 5',
                    }}
                  />
                ))}
            </MapContainer>

            <div className="pointer-events-none absolute left-3 top-3 z-20 grid gap-2 sm:grid-cols-2">
              <div className="rounded-sm border border-slate-300 bg-white/95 px-3 py-2 shadow-sm">
                <div className="text-[10px] font-semibold text-slate-600">Total catch</div>
                <div className="text-[15px] font-semibold text-slate-900">{stats.totalCatchKg} kg</div>
              </div>
              <div className="rounded-sm border border-slate-300 bg-white/95 px-3 py-2 shadow-sm">
                <div className="text-[10px] font-semibold text-slate-600">Mean CPUE</div>
                <div className="text-[15px] font-semibold text-slate-900">{stats.meanCpue}</div>
              </div>
              <div className="rounded-sm border border-slate-300 bg-white/95 px-3 py-2 shadow-sm">
                <div className="text-[10px] font-semibold text-slate-600">Hotspots active</div>
                <div className="text-[15px] font-semibold text-slate-900">{stats.hotspots}</div>
              </div>
              <div className="rounded-sm border border-slate-300 bg-white/95 px-3 py-2 shadow-sm">
                <div className="text-[10px] font-semibold text-slate-600">Trips</div>
                <div className="text-[15px] font-semibold text-slate-900">{stats.trips}</div>
              </div>
            </div>

            {/* Mobile toggle buttons */}
            <div className="absolute left-3 top-[100px] z-50 flex gap-2 sm:hidden">
              <button
                onClick={() => { setShowFiltersPanel(!showFiltersPanel); setShowInsightsPanel(false) }}
                className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-md border border-slate-200"
              >
                ☰ Filters
              </button>
              <button
                onClick={() => { setShowInsightsPanel(!showInsightsPanel); setShowFiltersPanel(false) }}
                className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-md border border-slate-200"
              >
                ℹ Insights
              </button>
            </div>

            {/* Mobile backdrop */}
            {(showFiltersPanel || showInsightsPanel) && (
              <div
                className="fixed inset-0 z-40 bg-black/40 sm:hidden"
                onClick={() => { setShowFiltersPanel(false); setShowInsightsPanel(false) }}
              />
            )}

            <div className={`z-50 w-[220px] rounded-sm border border-slate-300 bg-white shadow-sm flex flex-col sm:absolute sm:left-3 sm:top-[132px] sm:w-[220px] ${showFiltersPanel ? 'fixed left-4 right-4 top-16 w-auto' : 'hidden sm:flex'}`} style={{maxHeight: showFiltersPanel ? 'calc(100vh - 80px)' : 'calc(100% - 148px)'}}>
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 shrink-0">
                <span className="text-[11px] font-semibold text-slate-800">Layers & Filters</span>
                <button
                  onClick={() => setShowFiltersPanel(false)}
                  className="sm:hidden rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-3 px-3 py-3 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showCatch} onChange={(e) => setShowCatch(e.target.checked)} />
                    <span>Catch (CPUE)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showHotspots} onChange={(e) => setShowHotspots(e.target.checked)} />
                    <span>Hotspots</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showMigration} onChange={(e) => setShowMigration(e.target.checked)} />
                    <span>Migration</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showPredictions}
                      onChange={(e) => setShowPredictions(e.target.checked)}
                    />
                    <span>Predictions</span>
                  </label>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">Year</label>
                  <select
                    className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-2 text-[12px]"
                    value={selectedYear}
                    onChange={(e) => { setSelectedYear(e.target.value); setSelectedMonth('All') }}
                  >
                    <option value="2025">2025 (Previous)</option>
                    <option value="2026">2026 (Current)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">Month</label>
                  <select
                    className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-2 text-[12px]"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  >
                    {monthOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">Season</label>
                  <select
                    className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-2 text-[12px]"
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(e.target.value)}
                  >
                    {seasons.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">Abundance</label>
                  <select
                    className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-2 text-[12px]"
                    value={selectedAbundance}
                    onChange={(e) => setSelectedAbundance(e.target.value)}
                  >
                    {abundances.map((a) => (
                      <option key={a} value={a}>
                        {a === 'All' ? 'All' : a[0].toUpperCase() + a.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-[10px] text-slate-600">
                  This view uses simulated research data for thesis visualization.
                </div>
              </div>
            </div>

            <div className="hidden sm:block absolute bottom-3 right-3 z-20 w-[200px] rounded-sm border border-slate-300 bg-white/95 shadow-sm">
              <div className="border-b border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-800">Legend</div>
              <div className="space-y-2 px-3 py-3 text-[12px] text-slate-700">
                <div className="text-[11px] font-semibold text-slate-700">Catch points (CPUE)</div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: '#ef4444' }} />
                  <span>Low abundance</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: '#f59e0b' }} />
                  <span>Medium abundance</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: '#16a34a' }} />
                  <span>High abundance</span>
                </div>
                <div className="pt-1 text-[11px] font-semibold text-slate-700">Hotspots</div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#06b6d4', opacity: 0.55 }} />
                  <span>Hotspot zone</span>
                </div>
                <div className="pt-1 text-[11px] font-semibold text-slate-700">Migration</div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-[2px] w-6" style={{ background: '#2563eb' }} />
                  <span>Corridor / direction</span>
                </div>
                <div className="pt-1 text-[11px] font-semibold text-slate-700">Predictions</div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full border"
                    style={{ borderColor: '#7c3aed', background: '#a78bfa', opacity: 0.55 }}
                  />
                  <span>Trend-based zone</span>
                </div>
              </div>
            </div>

            <div className={`z-50 w-[220px] rounded-sm border border-slate-300 bg-white shadow-sm sm:absolute sm:right-3 sm:top-3 sm:w-[220px] ${showInsightsPanel ? 'fixed left-4 right-4 top-16' : 'hidden sm:block'}`}>
              <div className="border-b border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-800">Insights</div>
              <div className="space-y-3 px-3 py-3 text-[12px] text-slate-700">
                <div className="rounded-sm border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-semibold text-slate-800">Summary</div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between"><span>Catch records</span><span className="font-semibold text-slate-900">{filteredCatch.length}</span></div>
                    <div className="flex items-center justify-between"><span>Hotspots visible</span><span className="font-semibold text-slate-900">{filteredHotspots.length}</span></div>
                    <div className="flex items-center justify-between"><span>Migration routes</span><span className="font-semibold text-slate-900">{filteredMigration.length}</span></div>
                  </div>
                </div>
                <div className="rounded-sm border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-semibold text-slate-800">Interpretation</div>
                  <div className="mt-2 text-[12px] text-slate-700">
                    Focus on CPUE-sized points and cyan hotspot zones to interpret seasonal shifts without clutter.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
