import { CompletionInfo } from '@/lib/chat-types'
import {
  formatDuration,
  formatTokens,
  formatMilliseconds,
  formatRate,
  formatCountWithDuration,
} from '@/lib/formatters'

export function ResponseDetails({ info }: { info: CompletionInfo }) {
  const totalTokens = (info.promptEvalCount ?? 0) + (info.evalCount ?? 0)
  const tokensPerSecond =
    typeof info.tokensPerSecond === 'number' && Number.isFinite(info.tokensPerSecond)
      ? info.tokensPerSecond
      : undefined
  const responseTime =
    typeof info.responseTimeMs === 'number' && info.responseTimeMs > 0
      ? info.responseTimeMs
      : typeof info.totalDuration === 'number' && info.totalDuration > 0
        ? info.totalDuration / 1e6
        : undefined

  const fields: Array<{ label: string; value: string }> = [
    { label: 'Model', value: info.model ?? 'N/A' },
    {
      label: 'Response time',
      value: responseTime ? formatMilliseconds(responseTime) : 'N/A',
    },
    { label: 'Input tokens', value: formatTokens(info.promptEvalCount) },
    { label: 'Output tokens', value: formatTokens(info.evalCount) },
    { label: 'Total tokens', value: formatTokens(totalTokens) },
    {
      label: 'Tokens / second',
      value: tokensPerSecond ? formatRate(tokensPerSecond, 'tok/s') : 'N/A',
    },
    { label: 'Done reason', value: info.doneReason ?? 'N/A' },
    { label: 'Total duration', value: formatDuration(info.totalDuration) },
    { label: 'Load duration', value: formatDuration(info.loadDuration) },
    {
      label: 'Prompt tokens',
      value: formatCountWithDuration(info.promptEvalCount, info.promptEvalDuration),
    },
    {
      label: 'Response tokens',
      value: formatCountWithDuration(info.evalCount, info.evalDuration),
    },
  ]

  return (
    <div className="grid gap-1 text-xs">
      {fields.map((field) => (
        <div key={field.label} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{field.label}</span>
          <span className="font-medium text-foreground">{field.value}</span>
        </div>
      ))}
    </div>
  )
}

// Default export for lazy loading
export default ResponseDetails
