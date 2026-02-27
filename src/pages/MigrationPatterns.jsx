import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer } from 'react-leaflet'
import { getCatchPoints, getCatchPointsByYear, getPredictions, getBulanSeaSimulatedDataset } from '../services/dataService.js'

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

function abundanceColor(level) {
  if (level === 'high') return '#16a34a'
  if (level === 'medium') return '#f59e0b'
  return '#ef4444'
}

export default function MigrationPatterns() {
  const navigate = useNavigate()
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
    const filtered = predictions.filter((p) => isMarine(p.lat, p.lng))
    return filtered
      .map((p) => ({ ...p, _d: parseDate(p.date) }))
      .sort((a, b) => {
        if (!a._d && !b._d) return 0
        if (!a._d) return 1
        if (!b._d) return -1
        return a._d - b._d
      })
  }, [predictions, isMarine])

  const path = useMemo(
    () => {
      const points = orderedPredictions.map((p) => [p.lat, p.lng])
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
    [orderedPredictions, isMarine],
  )

  const pathDistanceKm = useMemo(() => {
    if (path.length < 2) return 0
    let sum = 0
    for (let i = 1; i < path.length; i++) sum += distanceKm(path[i - 1], path[i])
    return sum
  }, [path])

  const overallCpue = useMemo(() => {
    const catchKg = catchPoints.reduce((s, r) => s + (Number(r.catchKg) || 0), 0)
    const effortHours = catchPoints.reduce((s, r) => s + (Number(r.effortHours) || 0), 0)
    return effortHours > 0 ? catchKg / effortHours : 0
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

  const stageHotspots = useMemo(() => dataset?.hotspots ?? [], [dataset])

  const stageStats = useMemo(() => {
    const totalCatch = stageCatch.reduce((s, r) => s + (Number(r.catchKg) || 0), 0)
    const totalEffort = stageCatch.reduce((s, r) => s + (Number(r.effortHours) || 6), 0)
    const cpue = totalEffort > 0 ? (totalCatch / totalEffort).toFixed(2) : '0.00'
    return { totalCatch: Math.round(totalCatch), cpue, records: stageCatch.length, hotspots: stageHotspots.length }
  }, [stageCatch, stageHotspots])

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Migration Patterns</h1>
        <p className="mt-2 text-sm text-slate-600 md:text-base">
          Skipjack tuna migration pathways and movement patterns in Bulan Sea.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Migration Path Map</h2>
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
              <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              <span className="text-sm font-medium text-blue-900">{path.length} points</span>
            </div>
          </div>

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

              {path.length >= 2 && <Polyline positions={path} pathOptions={{ color: '#1d4ed8', weight: 4 }} />}

              {orderedPredictions.map((p, idx) => (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lng]}
                  radius={idx === 0 ? 8 : 6}
                  pathOptions={{
                    color: '#0f172a',
                    weight: 1,
                    fillColor: idx === 0 ? '#16a34a' : '#2563eb',
                    fillOpacity: 0.85,
                  }}
                />
              ))}
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
            <button
              onClick={() => { setSelectedStage(selectedStage === 'juvenile' ? null : 'juvenile'); setStageMonth('All') }}
              className={`mt-4 w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2 ${selectedStage === 'juvenile' ? 'bg-emerald-700' : 'bg-emerald-500 hover:bg-emerald-600'}`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
              {selectedStage === 'juvenile' ? 'Hide Map' : 'View on Map'}
            </button>
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
            <button
              onClick={() => { setSelectedStage(selectedStage === 'breeding' ? null : 'breeding'); setStageMonth('All') }}
              className={`mt-4 w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2 ${selectedStage === 'breeding' ? 'bg-amber-700' : 'bg-amber-500 hover:bg-amber-600'}`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
              {selectedStage === 'breeding' ? 'Hide Map' : 'View on Map'}
            </button>
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
            <button
              onClick={() => { setSelectedStage(selectedStage === 'adult' ? null : 'adult'); setStageMonth('All') }}
              className={`mt-4 w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2 ${selectedStage === 'adult' ? 'bg-blue-800' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
              {selectedStage === 'adult' ? 'Hide Map' : 'View on Map'}
            </button>
          </div>

        </div>

        {/* Inline Stage Distribution Map */}
        {selectedStage && (() => {
          const cfg = STAGE_CONFIG[selectedStage]
          const borderColor = { emerald: 'border-emerald-300', amber: 'border-amber-300', blue: 'border-blue-300' }[cfg.color]
          const headerBg = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', blue: 'bg-blue-600' }[cfg.color]
          const monthOptions = ['All', ...cfg.months]
          return (
            <div className={`mt-6 rounded-xl border-2 ${borderColor} bg-white overflow-hidden`}>
              {/* Header */}
              <div className={`${headerBg} px-5 py-3 flex items-center justify-between`}>
                <div className="flex items-center gap-2 text-white">
                  <span className="text-lg">{cfg.emoji}</span>
                  <span className="font-bold text-sm">{cfg.label} — Distribution Map</span>
                  <span className="text-xs opacity-80">· {cfg.year} · {cfg.season}</span>
                </div>
                <button onClick={() => setSelectedStage(null)} className="text-white/80 hover:text-white">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Stats bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-200 border-b border-slate-200">
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold text-slate-500">Total Catch</p>
                  <p className="text-lg font-bold text-slate-900">{stageStats.totalCatch} kg</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold text-slate-500">Mean CPUE</p>
                  <p className="text-lg font-bold text-slate-900">{stageStats.cpue}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold text-slate-500">Catch Records</p>
                  <p className="text-lg font-bold text-slate-900">{stageStats.records}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold text-slate-500">Hotspots</p>
                  <p className="text-lg font-bold text-slate-900">{stageStats.hotspots}</p>
                </div>
              </div>

              {/* Month filter row — horizontal on mobile */}
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
                <label className="text-[11px] font-semibold text-slate-700 shrink-0">Month:</label>
                <select
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={stageMonth}
                  onChange={(e) => setStageMonth(e.target.value)}
                >
                  {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <div className="flex items-center gap-3 ml-auto text-[11px] text-slate-600">
                  <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-full inline-block bg-amber-500 shrink-0" />Catch</div>
                  <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm inline-block bg-cyan-400 opacity-60 shrink-0" />Hotspot</div>
                  <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-full inline-block border border-purple-500 bg-purple-300 opacity-60 shrink-0" />Prediction</div>
                </div>
              </div>

              {/* Map — full width, explicit height */}
              <div className="w-full h-[360px] sm:h-[420px]">
                  <MapContainer
                    key={selectedStage}
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

                    {/* Hotspots */}
                    {stageHotspots.map((h) => isMarine(h.center_lat + latOffset, h.center_lng + lngOffset) && (
                      <Circle
                        key={h.id}
                        center={[h.center_lat + latOffset, h.center_lng + lngOffset]}
                        radius={(h.radius_km || 5) * 1000}
                        pathOptions={{ color: '#06b6d4', weight: 1, fillColor: '#06b6d4', fillOpacity: 0.18 }}
                      />
                    ))}

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
                        pathOptions={{ color: '#7c3aed', weight: 2, fillColor: '#a78bfa', fillOpacity: 0.35, dashArray: '4 4' }}
                      />
                    ))}
                  </MapContainer>
              </div>
            </div>
          )
        })()}

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
