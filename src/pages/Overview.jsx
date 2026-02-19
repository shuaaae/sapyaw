import { Link } from 'react-router-dom'
import StudyMap from '../components/Map.jsx'
import Chart from '../components/Chart.jsx'
import { useEffect, useMemo, useState } from 'react'
import { getCatchPoints, getPredictions, getEnvironmentalParams, getBulanSeaSimulatedDataset } from '../services/dataService.js'
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet'
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
      map.set(m, { catchKg: 0, trips: 0, cpueSum: 0, n: 0 })
    }
    for (const r of catchLocations) {
      const m = r.month
      if (!map.has(m)) continue
      const prev = map.get(m)
      map.set(m, {
        catchKg: prev.catchKg + (Number(r.catch_volume_kg) || 0),
        trips: prev.trips + (Number(r.fishing_effort_trips) || 0),
        cpueSum: prev.cpueSum + (Number(r.CPUE) || 0),
        n: prev.n + 1,
      })
    }
    return Array.from(map.entries()).map(([month, data]) => ({
      month,
      catchKg: data.catchKg,
      trips: data.trips,
      avgCpue: data.n > 0 ? data.cpueSum / data.n : 0,
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
    <section className="border border-slate-300 bg-white shadow-sm">
      <div className="border-b border-slate-300 p-4">
        <h1 className="text-xl font-semibold text-slate-900">Overview</h1>
        <p className="mt-1 text-[12px] text-slate-700">
          Summary dashboard of all pages (mock data wired).
        </p>
      </div>

      <div className="grid gap-3 border-b border-slate-300 p-4 sm:grid-cols-3">
        <div className="rounded-sm border border-slate-300 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold text-slate-700">Catch records</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{totals.catchCount}</div>
        </div>
        <div className="rounded-sm border border-slate-300 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold text-slate-700">Prediction records</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{totals.predCount}</div>
        </div>
        <div className="rounded-sm border border-slate-300 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold text-slate-700">Environmental records</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{totals.envCount}</div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2" style={{ minHeight: '600px' }}>
        {cards.map((c) => {
          const isMapCard = c.kind === 'map' || c.to === '/distribution-maps'
          return (
            <div
              key={c.to}
              className={`rounded-sm border border-slate-300 bg-slate-50 ${
                isMapCard ? 'p-2' : 'p-4'
              } flex flex-col h-full ${c.wide ? 'lg:col-span-2' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[13px] font-semibold text-slate-900">{c.title}</h2>
                  {!isMapCard && <p className="mt-1 text-[12px] text-slate-700">{c.description}</p>}
                </div>
                <Link
                  to={c.to}
                  className="shrink-0 rounded-sm border border-slate-300 bg-sky-800 px-3 py-2 text-[12px] font-semibold text-white hover:bg-sky-900"
                >
                  Open
                </Link>
              </div>

              {isMapCard && (
                <div className="flex-1 mt-2 min-h-0">
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
                <div className="mt-3">
                  {c.kind === 'chart' ? (
                    <div className="space-y-3">
                      <div className="rounded-sm border border-slate-300 bg-white p-2">
                        <div className="text-[11px] font-semibold text-slate-700 mb-2">Monthly Catch (kg)</div>
                        <Chart type="bar" data={catchChartData.data} options={catchChartData.options} height={100} />
                      </div>
                      <div className="rounded-sm border border-slate-300 bg-white p-2">
                        <div className="text-[11px] font-semibold text-slate-700 mb-2">Mean CPUE (kg/trip)</div>
                        <Chart type="line" data={cpueChartData.data} options={cpueChartData.options} height={100} />
                      </div>
                    </div>
                  ) : (
                    <div className="h-24 rounded-sm border border-slate-300 bg-white p-3 text-[12px] text-slate-700">
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
