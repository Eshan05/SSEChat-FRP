import { CompletionInfo, SessionAnalytics } from '@/lib/chat-types'

export function computeAnalytics(
  infoRecord: Record<string, CompletionInfo>,
  contextWindow: number | null,
): SessionAnalytics {
  const sorted = Object.entries(infoRecord)
    .map(([id, info]) => ({ id, info }))
    .filter((entry) => entry.info)

  const lastEntry = sorted.length > 0 ? sorted[sorted.length - 1] : undefined
  const lastInfo = lastEntry?.info
  const promptTokens = typeof lastInfo?.promptEvalCount === 'number' ? lastInfo.promptEvalCount : 0
  const lastOutputTokens = typeof lastInfo?.evalCount === 'number' ? lastInfo.evalCount : 0
  const totalOutputTokens = sorted.reduce((sum, entry) => {
    return sum + (entry.info.evalCount ?? 0)
  }, 0)
  const contextTokens = promptTokens + lastOutputTokens

  const totalEvalDurationSeconds = sorted.reduce((sum, entry) => {
    const { evalDuration } = entry.info
    if (typeof evalDuration === 'number' && evalDuration > 0) {
      return sum + evalDuration / 1e9
    }
    return sum
  }, 0)

  const tokensPerSecond =
    totalEvalDurationSeconds > 0 && totalOutputTokens > 0
      ? totalOutputTokens / totalEvalDurationSeconds
      : undefined

  const lastTokensPerSecond =
    lastInfo && typeof lastInfo.evalDuration === 'number' && lastInfo.evalDuration > 0 && typeof lastInfo.evalCount === 'number'
      ? lastInfo.evalCount / (lastInfo.evalDuration / 1e9)
      : undefined

  const responseTimes = sorted
    .map(({ info }) => {
      if (typeof info.responseTimeMs === 'number' && info.responseTimeMs > 0) {
        return info.responseTimeMs
      }
      if (typeof info.totalDuration === 'number' && info.totalDuration > 0) {
        return info.totalDuration / 1e6
      }
      return undefined
    })
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  const averageResponseTimeMs = responseTimes.length
    ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length
    : undefined

  const lastResponseTimeMs = responseTimes.length
    ? responseTimes[responseTimes.length - 1]
    : undefined

  const averageTokensPerMessage =
    sorted.length > 0 ? totalOutputTokens / sorted.length : undefined

  const contextUsagePercent =
    contextWindow && contextWindow > 0
      ? (contextTokens / contextWindow) * 100
      : undefined

  return {
    totalMessages: sorted.length,
    promptTokens,
    totalOutputTokens,
    contextTokens,
    averageTokensPerMessage,
    tokensPerSecond,
    lastTokensPerSecond,
    averageResponseTimeMs,
    lastResponseTimeMs,
    contextWindow: contextWindow ?? null,
    contextUsagePercent,
  }
}
