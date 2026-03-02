import { Link } from 'react-router-dom'
import StudyMap from '../components/Map.jsx'
import Chart from '../components/Chart.jsx'
import { useEffect, useMemo, useState } from 'react'
import { getCatchPoints, getPredictions, getEnvironmentalParams, getBulanSeaSimulatedDataset } from '../services/dataService.js'
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet'
import { computeCpue } from '../utils/statistics.js'
import 'leaflet/dist/leaflet.css'

function pointInPolygon(point, polygon) {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function isSegmentMarine(isMarine, lat1, lng1, lat2, lng2, steps = 8) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const lat = lat1 + (lat2 - lat1) * t
    const lng = lng1 + (lng2 - lng1) * t
    if (!isMarine(lat, lng)) return false
  }
  return true
}

function parseDate(value) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export default function Overview() {
  const [catchPoints, setCatchPoints] = useState([])
  const [predictions, setPredictions] = useState([])
  const [envParams, setEnvParams] = useState([])
  const [dataset, setDataset] = useState(null)

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
    getEnvironmentalParams().then((rows) => {
      if (cancelled) return
      setEnvParams(Array.isArray(rows) ? rows : [])
    })
    getBulanSeaSimulatedDataset().then((data) => {
      if (cancelled) return
      setDataset(data || null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const totals = useMemo(
    () => ({
      catchCount: catchPoints.length,
      predCount: predictions.length,
      envCount: envParams.length,
    }),
    [catchPoints.length, predictions.length, envParams.length],
  )

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

  const monthOrder = useMemo(() => [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ], [])

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
      map.set(m, {
        catchKg: prev.catchKg + (Number(r.catch_volume_kg) || 0),
        trips: prev.trips + (Number(r.fishing_effort_trips) || 0),
      })
    }
    return Array.from(map.entries()).map(([month, data]) => ({
      month,
      catchKg: data.catchKg,
      trips: data.trips,
      avgCpue: computeCpue(data.catchKg, data.trips),
    }))
  }, [catchLocations, monthOrder])

  const catchChartData = useMemo(() => ({
    data: {
      labels: monthly.map((m) => m.month.slice(0, 3)),
      datasets: [
        {
          label: 'Catch (kg)',
          data: monthly.map((m) => m.catchKg),
          backgroundColor: '#2563eb',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
      scales: {
        x: { ticks: { display: true, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
        y: { ticks: { display: true }, grid: { display: true } },
      },
    },
  }), [monthly])

  const cpueChartData = useMemo(() => ({
    data: {
      labels: monthly.map((m) => m.month.slice(0, 3)),
      datasets: [
        {
          label: 'CPUE (kg/trip)',
          data: monthly.map((m) => m.avgCpue),
          borderColor: '#16a34a',
          backgroundColor: '#16a34a',
          fill: false,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
      scales: {
        x: { ticks: { display: true, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
        y: { ticks: { display: true }, grid: { display: true } },
      },
    },
  }), [monthly])

  const cards = [
    {
      title: 'Study Area',
      to: '/study-area',
      description: 'Bulan Sea basemap and study area context.',
      kind: 'map',
      wide: true,
    },
    {
      title: 'Charts & Data',
      to: '/charts-data',
      description: 'Catch data charts, CPUE, and summaries.',
      kind: 'chart',
    },
    {
      title: 'Downloads',
      to: '/downloads',
      description: 'Export maps, charts, and reports.',
    },
  ]

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Overview</h1>
        <p className="mt-2 text-sm text-slate-600 md:text-base">
          Summary dashboard of skipjack tuna distribution and migration patterns in Bulan Sea.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-3">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-600">Catch Records</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{totals.catchCount}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-green-50 to-white p-6 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-3">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-600">Predictions</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{totals.predCount}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-purple-50 to-white p-6 shadow-sm transition-shadow hover:shadow-md sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-3">
              <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-600">Environmental Data</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{totals.envCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {cards.map((c) => {
          const isMapCard = c.kind === 'map' || c.to === '/distribution-maps'
          return (
            <div
              key={c.to}
              className={`rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md ${
                isMapCard ? 'p-4' : 'p-6'
              } flex flex-col ${c.wide ? 'lg:col-span-2' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-slate-900">{c.title}</h2>
                  {!isMapCard && <p className="mt-1 text-sm text-slate-600">{c.description}</p>}
                </div>
                <Link
                  to={c.to}
                  className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  View
                </Link>
              </div>

              {isMapCard && (
                <div className="mt-4 flex-1 min-h-[300px] md:min-h-[400px] rounded-lg overflow-hidden border border-slate-200">
                  {c.to === '/migration-patterns' ? (
                    <MapContainer
                      center={[12.66475 + latOffset, 123.8728889 + lngOffset]}
                      zoom={10}
                      style={{ height: '100%', width: '100%' }}
                      zoomControl={false}
                      attributionControl={false}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {path.length >= 2 && <Polyline positions={path} pathOptions={{ color: '#1d4ed8', weight: 4 }} />}
                      {orderedPredictions.map((p, idx) => (
                        <CircleMarker
                          key={p.id}
                          center={[p.lat + latOffset, p.lng + lngOffset]}
                          radius={idx === 0 ? 6 : 4}
                          pathOptions={{
                            color: '#0f172a',
                            weight: 1,
                            fillColor: idx === 0 ? '#16a34a' : '#2563eb',
                            fillOpacity: 0.9,
                          }}
                        />
                      ))}
                    </MapContainer>
                  ) : (
                    c.kind === 'map' && <StudyMap embedded height="100%" showHeader={false} interactive={false} />
                  )}
                </div>
              )}

              {!isMapCard && (
                <div className="mt-4">
                  {c.kind === 'chart' ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-semibold text-slate-700 mb-3">Monthly Catch (kg)</div>
                        <Chart type="bar" data={catchChartData.data} options={catchChartData.options} height={120} />
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-semibold text-slate-700 mb-3">Mean CPUE (kg/trip)</div>
                        <Chart type="line" data={cpueChartData.data} options={cpueChartData.options} height={120} />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      {c.to === '/distribution-maps' && (
                        <div>Distribution points available: {totals.predCount}</div>
                      )}
                      {c.to === '/migration-patterns' && (
                        <div>Catch records available: {totals.catchCount}</div>
                      )}
                      {c.to === '/charts-data' && (
                        <div>CPUE can be computed from {totals.catchCount} catch records</div>
                      )}
                      {c.to === '/downloads' && (
                        <div>CSV exports: catch_points.csv, predictions.csv</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
