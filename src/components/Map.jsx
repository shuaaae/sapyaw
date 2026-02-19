import { useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

function ZoomTracker({ onZoomChange }) {
  useMapEvents({
    zoom(e) {
      onZoomChange(e.target.getZoom())
    },
    zoomend(e) {
      onZoomChange(e.target.getZoom())
    },
  })
  return null
}

export default function Map() {
  const bulanSeaCenter = [12.66475, 123.8728889]
  const bulanSeaBounds = [
    [12.40, 123.55],
    [12.90, 124.20],
  ]
  const bulanTown = [12.6709, 123.8752]

  const defaultZoom = 10
  const hideLabelAtZoomAbove = 10
  const [zoom, setZoom] = useState(defaultZoom)

  const bulanLabelIcon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html:
          '<div style="display:inline-flex;align-items:center;justify-content:center;">'
          + '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block;filter:drop-shadow(0 10px 16px rgba(0,0,0,0.40));">'
          + '<path d="M12 22s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z" fill="#ef4444"/>'
          + '<path d="M12 14.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="#ffffff"/>'
          + '</svg>'
          + '</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 34],
      }),
    [],
  )

  return (
    <MapPanel
      bulanSeaBounds={bulanSeaBounds}
      bulanSeaCenter={bulanSeaCenter}
      bulanTown={bulanTown}
      bulanLabelIcon={bulanLabelIcon}
      defaultZoom={defaultZoom}
      hideLabelAtZoomAbove={hideLabelAtZoomAbove}
      onZoomChange={setZoom}
      zoom={zoom}
    />
  )
}

function MapPanel({
  bulanSeaBounds,
  bulanSeaCenter,
  bulanTown,
  bulanLabelIcon,
  defaultZoom,
  hideLabelAtZoomAbove,
  onZoomChange,
  zoom,
  height = 520,
  showHeader = true,
  embedded = false,
  interactive = true,
}) {
  const container = (
    <div
      className={
        embedded
          ? 'w-full overflow-hidden rounded-sm border border-slate-300 bg-white'
          : 'w-full overflow-hidden rounded-sm border border-slate-300 bg-white'
      }
      style={{ height }}
    >
      <MapContainer
        center={bulanSeaCenter}
        zoom={defaultZoom}
        minZoom={defaultZoom}
        maxZoom={18}
        maxBounds={bulanSeaBounds}
        maxBoundsViscosity={1.0}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        touchZoom={interactive}
        zoomControl={interactive}
        style={{ height: '100%', width: '100%', zIndex: 0 }}
      >
        <ZoomTracker onZoomChange={onZoomChange} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {zoom <= hideLabelAtZoomAbove && <Marker position={bulanTown} icon={bulanLabelIcon} />}
      </MapContainer>
    </div>
  )

  if (embedded) return container

  return (
    <section className="rounded-sm border border-slate-300 bg-slate-50 p-3">
      {showHeader && (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[12px] font-semibold text-slate-900">Bulan Sea Map</h2>
          <div className="text-[11px] text-slate-600">Centered view</div>
        </div>
      )}

      {container}
    </section>
  )
}
