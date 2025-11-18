import { type ReactNode } from 'react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { SessionAnalytics } from '@/lib/chat-types'
import {
  formatRate,
  formatMilliseconds,
  formatTokens,
  formatPercentage,
  numericOrNull,
  computeProgress,
  decimalFormatter,
  clamp,
} from '@/lib/formatters'

const TOKEN_RATE_TARGET = 200
const RESPONSE_TARGET_MS = 2000

type DeltaVariant = 'positive' | 'negative' | 'neutral'

function describeDelta(
  baseline: number | null,
  comparison: number | null,
  options: { inverse?: boolean } = {},
): { label: string; variant: DeltaVariant } | null {
  const { inverse = false } = options
  if (
    baseline == null ||
    comparison == null ||
    !Number.isFinite(baseline) ||
    !Number.isFinite(comparison) ||
    baseline === 0
  ) {
    return null
  }

  const delta = comparison - baseline
  const percent = (delta / baseline) * 100

  if (!Number.isFinite(percent)) {
    return null
  }

  const arrow = delta === 0 ? '→' : delta > 0 ? '↑' : '↓'
  const formattedPercent = Math.abs(percent) >= 10 ? percent.toFixed(1) : percent.toFixed(2)
  const label = `${arrow} ${delta > 0 ? '+' : ''}${formattedPercent}%`
  let variant: DeltaVariant = 'neutral'

  if (delta !== 0) {
    const improvement = inverse ? delta <= 0 : delta >= 0
    variant = improvement ? 'positive' : 'negative'
  }

  return { label, variant }
}

function deltaVariantClass(variant: DeltaVariant) {
  switch (variant) {
    case 'positive':
      return 'text-emerald-500'
    case 'negative':
      return 'text-red-500'
    default:
      return 'text-muted-foreground'
  }
}

function StatTile({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-3 bg-background/90 p-4 sm:p-6', className)}>
      {children}
    </div>
  )
}

export function AnalyticsSummary({ analytics }: { analytics: SessionAnalytics }) {
  const {
    promptTokens,
    totalOutputTokens,
    contextTokens,
    averageTokensPerMessage,
    tokensPerSecond,
    lastTokensPerSecond,
    averageResponseTimeMs,
    lastResponseTimeMs,
    contextWindow,
    contextUsagePercent,
    totalMessages,
  } = analytics

  const tokenRateAverage = numericOrNull(tokensPerSecond)
  const tokenRateLast = numericOrNull(lastTokensPerSecond)
  const tokenRateProgress = computeProgress(tokenRateAverage ?? tokenRateLast, TOKEN_RATE_TARGET)
  const tokenRateDelta = describeDelta(tokenRateAverage, tokenRateLast)

  const responseAverage = numericOrNull(averageResponseTimeMs)
  const responseLast = numericOrNull(lastResponseTimeMs)
  const responseProgress = computeProgress(responseAverage ?? responseLast, RESPONSE_TARGET_MS)
  const responseDelta = describeDelta(responseAverage, responseLast, { inverse: true })

  const contextPercentRaw = numericOrNull(contextUsagePercent)
  const contextPercent = contextPercentRaw != null ? clamp(contextPercentRaw, 0, 100) : null
  const averageTokensDisplay =
    typeof averageTokensPerMessage === 'number' && Number.isFinite(averageTokensPerMessage)
      ? decimalFormatter.format(averageTokensPerMessage)
      : 'N/A'

  const contextLimit = typeof contextWindow === 'number' && contextWindow > 0 ? contextWindow : null

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-muted/40">
      <div className="grid grid-cols-1 gap-px bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Token throughput</span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground"></span>
          </div>
          <div className="text-2xl font-semibold text-foreground">
            {tokenRateAverage != null ? formatRate(tokenRateAverage, 'tok/s') : 'N/A'}
          </div>
          <Progress value={tokenRateProgress} className="h-1.5 bg-muted" />
          <div className="flex items-center justify-between text-xs -mt-1 uppercase tracking-wide text-muted-foreground">
            <span>0</span>
            <span>200</span>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Average</span>
              <span className="text-foreground">
                {tokenRateAverage != null ? formatRate(tokenRateAverage, 'tok/s') : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-2">
                Last
                {tokenRateDelta && (
                  <span className={cn('font-medium', deltaVariantClass(tokenRateDelta.variant))}>
                    {tokenRateDelta.label}
                  </span>
                )}
              </span>
              <span className="text-foreground">
                {tokenRateLast != null ? formatRate(tokenRateLast, 'tok/s') : 'N/A'}
              </span>
            </div>
          </div>
        </StatTile>

        <StatTile className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Response latency</span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground"></span>
          </div>
          <div className="text-2xl font-semibold text-foreground">
            {responseAverage != null ? formatMilliseconds(responseAverage) : 'N/A'}
          </div>
          <Progress value={responseProgress} className="h-1.5 bg-muted" />
          <div className="flex items-center justify-between -mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            <span>0</span>
            <span>{formatMilliseconds(RESPONSE_TARGET_MS)}</span>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Average</span>
              <span className="text-foreground">
                {responseAverage != null ? formatMilliseconds(responseAverage) : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-2">
                Last
                {responseDelta && (
                  <span className={cn('font-medium', deltaVariantClass(responseDelta.variant))}>
                    {responseDelta.label}
                  </span>
                )}
              </span>
              <span className="text-foreground">
                {responseLast != null ? formatMilliseconds(responseLast) : 'N/A'}
              </span>
            </div>
          </div>
        </StatTile>

        <StatTile>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Prompt tokens</span>
          <span className="text-xs text-muted-foreground -mt-2">
            Average tokens / M:{' '}
            <span className="text-foreground">{averageTokensDisplay}</span>
          </span>
          <span className="text-2xl font-semibold text-foreground">{formatTokens(promptTokens)}</span>
        </StatTile>

        <StatTile>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Output tokens</span>
          <span className="text-xs text-muted-foreground -mt-2">
            Total turns:{' '}
            <span className="text-foreground">{totalMessages}</span>
          </span>
          <span className="text-2xl font-semibold text-foreground">{formatTokens(totalOutputTokens)}</span>
        </StatTile>

        <StatTile className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Context usage</span>
            <span className="text-xs font-medium text-muted-foreground">
              {contextPercent != null ? formatPercentage(contextPercent) : 'N/A'}
            </span>
          </div>
          <div className="text-2xl font-semibold text-foreground">
            {contextPercent != null ? formatPercentage(contextPercent) : 'N/A'}
          </div>
          <Progress value={contextPercent ?? 0} className="h-1.5 bg-muted" />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground -mt-1">
            <span>0 tokens</span>
            <span>
              {contextLimit ? `${formatTokens(contextLimit)} limit` : 'Window unknown'}
            </span>
          </div>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Context Tokens / Max</span>
              <span className="text-foreground">
                {contextLimit ? `${formatTokens(contextTokens)} / ${formatTokens(contextLimit)}` : formatTokens(contextTokens)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Prompt</span>
              <span className="text-foreground">{formatTokens(promptTokens)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Output</span>
              <span className="text-foreground">{formatTokens(totalOutputTokens)}</span>
            </div>
          </div>
        </StatTile>
      </div>
    </div>
  )
}

// Default export for lazy loading
export default AnalyticsSummary
