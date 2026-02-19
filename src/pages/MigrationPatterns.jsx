import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet'
import { getCatchPoints, getPredictions } from '../services/dataService.js'

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

export default function MigrationPatterns() {
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

  useEffect(() => {
    let cancelled = false
    getPredictions().then((rows) => {
      if (cancelled) return
      setPredictions(Array.isArray(rows) ? rows : [])
    })
    getCatchPoints().then((rows) => {
      if (cancelled) return
      setCatchPoints(Array.isArray(rows) ? rows : [])
    })
    return () => {
      cancelled = true
    }
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

  return (
    <section className="border border-slate-300 bg-white shadow-sm">
      <div className="border-b border-slate-300 p-4">
        <h1 className="text-xl font-semibold text-slate-900">Migration Patterns</h1>
        <p className="mt-1 text-[12px] text-slate-700">
          Migration pathway view (mock data wired).
        </p>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-sm border border-slate-300 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold text-slate-900">Migration Path Map</h2>
            <div className="text-[11px] text-slate-600">Path points: {path.length}</div>
          </div>

          <div className="h-[520px] w-full overflow-hidden rounded-sm border border-slate-300 bg-white">
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

        <div className="space-y-4">
          <div className="rounded-sm border border-slate-300 bg-slate-50 p-4">
            <h2 className="text-[12px] font-semibold text-slate-900">Summary</h2>
            <div className="mt-3 space-y-2 text-[12px] text-slate-700">
              <div className="flex items-center justify-between">
                <span>Prediction points</span>
                <span className="font-semibold text-slate-900">{predictions.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated path distance</span>
                <span className="font-semibold text-slate-900">{pathDistanceKm.toFixed(1)} km</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Catch records</span>
                <span className="font-semibold text-slate-900">{catchPoints.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Overall CPUE</span>
                <span className="font-semibold text-slate-900">{overallCpue.toFixed(2)} kg/hr</span>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-slate-300 bg-slate-50 p-4">
            <h2 className="text-[12px] font-semibold text-slate-900">Path points (ordered)</h2>
            <div className="mt-3 overflow-hidden rounded-sm border border-slate-300 bg-white">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Zone</th>
                    <th className="px-3 py-2">Suit.</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedPredictions.map((p) => (
                    <tr key={p.id} className="border-t border-slate-200">
                      <td className="px-3 py-2">{p.date || '—'}</td>
                      <td className="px-3 py-2">{zoneNameForLatLng(p.lat, p.lng)}</td>
                      <td className="px-3 py-2">{Number(p.suitability).toFixed(2)}</td>
                    </tr>
                  ))}
                  {!orderedPredictions.length && (
                    <tr>
                      <td className="px-3 py-3 text-slate-600" colSpan={3}>
                        No prediction points.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
