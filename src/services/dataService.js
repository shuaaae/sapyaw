import { mockCatchPoints, mockEnvParams, mockPredictions, bulanSeaSimulatedDataset } from './mockData.js'

const monthToIndex = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
}

function isoDateForMonth2025(monthName, day = 15) {
  const idx = monthToIndex[monthName]
  if (idx == null) return '2025-01-01'
  const mm = String(idx + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `2025-${mm}-${dd}`
}

function deriveCatchPointsFromSimulatedDataset() {
  const rows = bulanSeaSimulatedDataset?.catch_locations || []
  return rows.map((r, i) => {
    const trips = Number(r.fishing_effort_trips) || 0
    const effortHours = trips > 0 ? trips * 6 : 6
    return {
      id: `bs-${r.id}`,
      date: isoDateForMonth2025(r.month, 10 + (i % 15)),
      lat: r.latitude,
      lng: r.longitude,
      catchKg: Number(r.catch_volume_kg) || 0,
      effortHours,
      gear: 'handline',
    }
  })
}

function isoDateForMonth2026(monthName, day = 15) {
  const idx = monthToIndex[monthName]
  if (idx == null) return '2026-01-01'
  const mm = String(idx + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `2026-${mm}-${dd}`
}

function derivePredictionsFromSimulatedDataset() {
  const rows = bulanSeaSimulatedDataset?.predictions || []
  const months = Object.keys(monthToIndex)
  return rows.map((p, i) => {
    const monthName = months[i % months.length] || 'January'
    return {
      id: `bs-${p.id}`,
      date: isoDateForMonth2026(monthName, 5 + (i % 20)),
      lat: p.predicted_lat,
      lng: p.predicted_lng,
      suitability: p.probability_level === 'high' ? 0.86 : p.probability_level === 'moderate' ? 0.78 : 0.7,
      cycle: p.probability_level === 'high' ? 'high' : p.probability_level === 'moderate' ? 'medium' : 'low',
    }
  })
}

export async function getCatchPoints() {
  const simulated = deriveCatchPointsFromSimulatedDataset() || []
  // Merge simulated (2025) with mockCatchPoints (2025 + 2026)
  const ids = new Set(simulated.map(p => p.id))
  const extra = mockCatchPoints.filter(p => !ids.has(p.id))
  return [...simulated, ...extra]
}

export async function getEnvironmentalParams() {
  return mockEnvParams
}

export async function getPredictions() {
  return derivePredictionsFromSimulatedDataset() || mockPredictions
}

export async function getBulanSeaSimulatedDataset() {
  return bulanSeaSimulatedDataset
}

// Function to get data filtered by year
export async function getCatchPointsByYear(year = '2025') {
  const catchPoints = await getCatchPoints()
  return catchPoints.filter(point => point.date.startsWith(year))
}

export async function getEnvironmentalParamsByYear(year = '2025') {
  const envParams = await getEnvironmentalParams()
  return envParams.filter(param => param.date.startsWith(year))
}

export async function getPredictionsByYear(year = '2026') {
  const predictions = await getPredictions()
  return predictions.filter(prediction => prediction.date.startsWith(year))
}
