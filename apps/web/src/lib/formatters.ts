export const integerFormatter = new Intl.NumberFormat()
export const decimalFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
})

export function formatDuration(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 'N/A'
  }

  const seconds = value / 1e9
  if (seconds >= 1) {
    return `${seconds.toFixed(2)} s`
  }

  const milliseconds = seconds * 1e3
  if (milliseconds >= 1) {
    return `${milliseconds.toFixed(1)} ms`
  }

  const microseconds = seconds * 1e6
  if (microseconds >= 1) {
    return `${microseconds.toFixed(1)} us`
  }

  return `${value.toFixed(0)} ns`
}

export function formatCountWithDuration(count?: number, duration?: number) {
  if (typeof count !== 'number') {
    return 'N/A'
  }

  const formattedCount = integerFormatter.format(count)
  if (typeof duration === 'number' && duration > 0) {
    return `${formattedCount} (${formatDuration(duration)})`
  }

  return formattedCount
}

export function formatTokens(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 'N/A'
  }

  return integerFormatter.format(value)
}

export function formatMilliseconds(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`
  }

  if (value >= 1) {
    return `${value.toFixed(0)} ms`
  }

  return `${(value * 1000).toFixed(0)} us`
}

export function formatRate(value: number, unit: string) {
  if (!Number.isFinite(value) || value <= 0) {
    return 'N/A'
  }

  if (value >= 100) {
    return `${value.toFixed(0)} ${unit}`
  }

  if (value >= 10) {
    return `${value.toFixed(1)} ${unit}`
  }

  return `${value.toFixed(2)} ${unit}`
}

export function formatPercentage(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 'N/A'
  }

  if (value === 0) {
    return '0%'
  }

  if (value >= 100) {
    return `${value.toFixed(1)}%`
  }

  if (value >= 1) {
    return `${value.toFixed(1)}%`
  }

  return `${value.toFixed(2)}%`
}

export function numericOrNull(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function computeProgress(value: number | null, target: number) {
  if (value == null || !Number.isFinite(value) || target <= 0) {
    return 0
  }

  return clamp((value / target) * 100, 0, 100)
}
