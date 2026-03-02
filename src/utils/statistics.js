export function safeDivide(numerator, denominator, fallback = 0) {
  const n = Number(numerator) || 0
  const d = Number(denominator) || 0
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return fallback
  return n / d
}

// CPUE = C / F
export function computeCpue(totalCatch, fishingEffort) {
  return safeDivide(totalCatch, fishingEffort, 0)
}

// Migration Pattern Index (MPI) = D / T
export function computeMigrationPatternIndex(distanceKm, timeIntervalMonths) {
  return safeDivide(distanceKm, timeIntervalMonths, 0)
}

// Intra-annual Spatial Distribution Index = location CPUE / max observed CPUE
export function computeSpatialDistributionIndex(locationCpue, maxObservedCpue) {
  const ratio = safeDivide(locationCpue, maxObservedCpue, 0)
  return Math.max(0, Math.min(1, ratio))
}

// Shelf-life Prediction Accuracy = (1 - |PSL - ASL| / ASL) * 100
export function computeShelfLifePredictionAccuracy(predictedShelfLife, actualShelfLife) {
  const psl = Number(predictedShelfLife)
  const asl = Number(actualShelfLife)
  if (!Number.isFinite(psl) || !Number.isFinite(asl) || asl <= 0) return null
  const accuracy = (1 - Math.abs(psl - asl) / asl) * 100
  return Math.max(0, Math.min(100, accuracy))
}

export function mean(values) {
  const arr = values.map(Number).filter((v) => Number.isFinite(v))
  if (!arr.length) return 0
  return arr.reduce((sum, value) => sum + value, 0) / arr.length
}

export function standardDeviation(values) {
  const arr = values.map(Number).filter((v) => Number.isFinite(v))
  if (!arr.length) return 0
  const m = mean(arr)
  const variance = arr.reduce((sum, value) => sum + (value - m) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

export function coefficientOfVariation(values) {
  const m = mean(values)
  if (m <= 0) return 0
  return (standardDeviation(values) / m) * 100
}

export function percentageContribution(part, total) {
  return safeDivide(part, total, 0) * 100
}

// Returns linear model y = intercept + slope * x where x = 1..n
export function linearTrend(values) {
  const y = values.map(Number).filter((v) => Number.isFinite(v))
  const n = y.length
  if (n < 2) return { intercept: 0, slope: 0 }

  const x = Array.from({ length: n }, (_, i) => i + 1)
  const sumX = x.reduce((s, v) => s + v, 0)
  const sumY = y.reduce((s, v) => s + v, 0)
  const sumXY = x.reduce((s, v, i) => s + v * y[i], 0)
  const sumXX = x.reduce((s, v) => s + v * v, 0)
  const denom = n * sumXX - sumX * sumX
  if (!denom) return { intercept: 0, slope: 0 }

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { intercept, slope }
}

export function pearsonCorrelation(xs, ys) {
  const x = xs.map(Number)
  const y = ys.map(Number)
  if (x.length !== y.length || x.length < 2) return 0

  const mx = mean(x)
  const my = mean(y)
  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < x.length; i += 1) {
    const dx = x[i] - mx
    const dy = y[i] - my
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  const den = Math.sqrt(denX * denY)
  if (!den) return 0
  return num / den
}
