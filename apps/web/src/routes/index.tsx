import { useCallback, useMemo, useRef, useState } from 'react'

import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { Info, Radio, Sparkles } from 'lucide-react'
import type { ChatMessage } from '@pkg/zod'

import { ChatComposer } from '@/components/ChatComposer'
import { useSelectedModel } from '@/components/SelectedModelProvider'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { API_BASE_URL } from '@/lib/api'
import { fetchModelInfo } from '@/lib/ollama'

export const Route = createFileRoute('/')({
  component: ChatPage,
})

type UIMessage = Pick<ChatMessage, 'role' | 'content'>

type CompletionInfo = {
  model?: string
  doneReason?: string
  totalDuration?: number
  loadDuration?: number
  promptEvalCount?: number
  promptEvalDuration?: number
  evalCount?: number
  evalDuration?: number
  responseTimeMs?: number
  tokensPerSecond?: number
}

type StreamEventPayload = {
  content?: string
  error?: string
  done?: boolean
  done_reason?: string
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
  model?: string
  message?: {
    role?: string
    content?: string
  }
}

const integerFormatter = new Intl.NumberFormat()
const decimalFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
})

function ChatPage() {
  const { model: selectedModel } = useSelectedModel()
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [messageInfo, setMessageInfo] = useState<Record<number, CompletionInfo>>({})
  const [attachments, setAttachments] = useState<File[]>([])
  const pendingResponseStart = useRef<Record<number, number>>({})
  const abortControllerRef = useRef<AbortController | null>(null)

  const canSend = input.trim().length > 0 && !isStreaming
  const hasMessages = messages.length > 0

  const sendPrompt = useCallback(async () => {
    const prompt = input.trim()
    if (!prompt || isStreaming) return

    const userMessage: UIMessage = { role: 'user', content: prompt }
    const conversation = [...messages, userMessage]
    const assistantIndex = conversation.length

    setMessages([...conversation, { role: 'assistant', content: '' }])
    setInput('')
    setAttachments([])
    setError(null)
    setIsStreaming(true)
    setMessageInfo((previous) => {
      const next = { ...previous }
      delete next[assistantIndex]
      return next
    })
    pendingResponseStart.current[assistantIndex] = performance.now()

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: conversation,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      if (!response.body) {
        throw new Error('Streaming is not supported in this environment.')
      }

      await consumeEventStream(
        response.body,
        (delta) => {
          setMessages((previous) => {
            const next = [...previous]
            const candidate = next[assistantIndex]

            if (candidate) {
              next[assistantIndex] = {
                ...candidate,
                content: candidate.content + delta,
              }
            }

            return next
          })
        },
        (message) => {
          setError(message)
        },
        (metadata: StreamEventPayload) => {
          const startedAt = pendingResponseStart.current[assistantIndex]
          const responseTimeMs =
            typeof startedAt === 'number' ? performance.now() - startedAt : undefined
          const evalSeconds =
            typeof metadata.eval_duration === 'number' && metadata.eval_duration > 0
              ? metadata.eval_duration / 1e9
              : undefined
          const tokensPerSecond =
            evalSeconds && metadata.eval_count
              ? metadata.eval_count / evalSeconds
              : undefined

          setMessageInfo((previous) => ({
            ...previous,
            [assistantIndex]: {
              model: metadata.model,
              doneReason: metadata.done_reason,
              totalDuration: metadata.total_duration,
              loadDuration: metadata.load_duration,
              promptEvalCount: metadata.prompt_eval_count,
              promptEvalDuration: metadata.prompt_eval_duration,
              evalCount: metadata.eval_count,
              evalDuration: metadata.eval_duration,
              responseTimeMs,
              tokensPerSecond,
            },
          }))
          delete pendingResponseStart.current[assistantIndex]
        },
      )
    } catch (exception) {
      if ((exception as DOMException)?.name === 'AbortError') {
        return
      }

      const fallbackMessage =
        exception instanceof Error ? exception.message : 'Unexpected error'
      setError(fallbackMessage)
    } finally {
      abortControllerRef.current = null
      setIsStreaming(false)
      delete pendingResponseStart.current[assistantIndex]
    }
  }, [input, isStreaming, messages, selectedModel])

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const hintText = useMemo(
    () =>
      isStreaming
        ? 'Streaming response from Fastify / Ollama...'
        : 'Ask anything and responses will stream as they arrive.',
    [isStreaming],
  )

  const { data: modelInfo } = useQuery({
    queryKey: ['model-info', selectedModel],
    queryFn: () => fetchModelInfo(selectedModel),
    staleTime: 1000 * 60 * 10,
    enabled: Boolean(selectedModel),
    refetchOnWindowFocus: false,
  })

  const analytics = useMemo(
    () => computeAnalytics(messageInfo, modelInfo?.contextLength ?? null),
    [messageInfo, modelInfo?.contextLength],
  )

  return (
    <main className="flex min-h-screen justify-center bg-muted/30 px-4 py-12">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 px-8 py-10 shadow-xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl space-y-3">
              <Badge variant="outline" className="rounded-full border-primary/60 bg-primary/10 text-primary">
                <Sparkles className="size-3.5" />
                Streaming made friendly
              </Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Conversational AI with real-time updates
                </h1>
                <p className="text-sm text-muted-foreground">
                  {hintText}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/70 px-4 py-3 shadow-sm">
                <Radio className="size-4 text-primary" />
                <div className="flex flex-col">
                  <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    Active model
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {selectedModel || 'Select a model below'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/70 px-4 py-3 shadow-sm">
                <Info className="size-4 text-primary" />
                <div className="flex flex-col">
                  <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    Context length
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {modelInfo?.contextLength
                      ? new Intl.NumberFormat().format(modelInfo.contextLength)
                      : 'Awaiting model info'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute -right-24 top-1/2 hidden h-56 w-56 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl sm:block" />
        </section>

        <Card className="flex flex-1 flex-col border-border/60 bg-card/60 backdrop-blur">
          <CardContent className="flex flex-1 flex-col gap-4">
            {analytics.totalMessages > 0 && (
              <AnalyticsSummary analytics={analytics} />
            )}
            <ScrollArea className="flex-1 rounded-2xl border bg-background/40">
              <div className="flex min-h-80 flex-col gap-3 p-4">
                {hasMessages ? (
                  messages.map((message, index) => (
                    <article
                      key={`${message.role}-${index}`}
                      className={
                        message.role === 'user'
                          ? 'ml-auto max-w-[85%] rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow'
                          : 'mr-auto max-w-[85%] rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground shadow'
                      }
                    >
                      <div className="mb-1 flex items-start justify-between gap-3">
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">
                          {message.role}
                        </p>
                        {message.role === 'assistant' && messageInfo[index] && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex size-6 items-center justify-center rounded-full bg-background/60 text-foreground/70 transition hover:bg-background hover:text-foreground"
                                aria-label="View response details"
                              >
                                <Info className="size-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent align="end" className="max-w-xs">
                              <ResponseDetails info={messageInfo[index]} />
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-left text-sm leading-relaxed">{message.content}</p>
                    </article>
                  ))
                ) : (
                  <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
                    Start the conversation to see streaming responses.
                  </div>
                )}
              </div>
            </ScrollArea>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>

          <CardFooter className="flex flex-col items-stretch gap-3">
            <ChatComposer
              inputValue={input}
              onInputChange={setInput}
              onSubmit={() => {
                void sendPrompt()
              }}
              onStop={stopStreaming}
              canSend={canSend}
              isStreaming={isStreaming}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              modelInfo={modelInfo}
            />
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}

function ResponseDetails({ info }: { info: CompletionInfo }) {
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

function formatDuration(value?: number) {
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

function formatCountWithDuration(count?: number, duration?: number) {
  if (typeof count !== 'number') {
    return 'N/A'
  }

  const formattedCount = integerFormatter.format(count)
  if (typeof duration === 'number' && duration > 0) {
    return `${formattedCount} (${formatDuration(duration)})`
  }

  return formattedCount
}

function formatTokens(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 'N/A'
  }

  return integerFormatter.format(value)
}

function formatMilliseconds(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`
  }

  if (value >= 1) {
    return `${value.toFixed(0)} ms`
  }

  return `${(value * 1000).toFixed(0)} us`
}

function formatRate(value: number, unit: string) {
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

function formatPercentage(value?: number) {
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

type SessionAnalytics = {
  totalMessages: number
  promptTokens: number
  totalOutputTokens: number
  contextTokens: number
  averageTokensPerMessage?: number
  tokensPerSecond?: number
  lastTokensPerSecond?: number
  averageResponseTimeMs?: number
  lastResponseTimeMs?: number
  contextWindow: number | null
  contextUsagePercent?: number
}

function computeAnalytics(
  infoRecord: Record<number, CompletionInfo>,
  contextWindow: number | null,
): SessionAnalytics {
  const sorted = Object.entries(infoRecord)
    .map(([index, info]) => ({ index: Number(index), info }))
    .filter((entry) => Number.isFinite(entry.index))
    .sort((a, b) => a.index - b.index)

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

function AnalyticsSummary({ analytics }: { analytics: SessionAnalytics }) {
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
  } = analytics

  const metrics: Array<{ label: string; value: string }> = [
    { label: 'Prompt tokens', value: formatTokens(promptTokens) },
    { label: 'Output tokens', value: formatTokens(totalOutputTokens) },
    { label: 'Context tokens', value: formatTokens(contextTokens) },
    {
      label: 'Avg tokens / message',
      value:
        typeof averageTokensPerMessage === 'number'
          ? decimalFormatter.format(averageTokensPerMessage)
          : 'N/A',
    },
    {
      label: 'Tokens / second (avg)',
      value:
        typeof tokensPerSecond === 'number'
          ? formatRate(tokensPerSecond, 'tok/s')
          : 'N/A',
    },
    {
      label: 'Tokens / second (last)',
      value:
        typeof lastTokensPerSecond === 'number'
          ? formatRate(lastTokensPerSecond, 'tok/s')
          : 'N/A',
    },
    {
      label: 'Response time (avg)',
      value:
        typeof averageResponseTimeMs === 'number'
          ? formatMilliseconds(averageResponseTimeMs)
          : 'N/A',
    },
    {
      label: 'Response time (last)',
      value:
        typeof lastResponseTimeMs === 'number'
          ? formatMilliseconds(lastResponseTimeMs)
          : 'N/A',
    },
  ]

  const contextValue = contextWindow
    ? `${formatPercentage(contextUsagePercent)} (${formatTokens(
      contextTokens,
    )} / ${formatTokens(contextWindow)})`
    : 'N/A'

  return (
    <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="space-y-1">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {metric.label}
            </dt>
            <dd className="text-sm font-medium text-foreground">{metric.value}</dd>
          </div>
        ))}
        <div className="space-y-1">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Context usage
          </dt>
          <dd className="text-sm font-medium text-foreground">{contextValue}</dd>
        </div>
      </dl>
    </div>
  )
}

async function readErrorMessage(response: Response) {
  try {
    const payload = await response.json()
    return payload?.error ?? response.statusText
  } catch {
    return response.statusText || 'Request failed'
  }
}

async function consumeEventStream(
  stream: ReadableStream<Uint8Array>,
  onContent: (delta: string) => void,
  onServerError: (message: string) => void,
  onComplete?: (payload: StreamEventPayload) => void,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary).trim()
      buffer = buffer.slice(boundary + 2)

      const data = extractEventData(rawEvent)
      if (!data) {
        boundary = buffer.indexOf('\n\n')
        continue
      }

      if (data === '[DONE]') {
        return
      }

      try {
        const payload = JSON.parse(data) as StreamEventPayload

        if (payload.error) {
          onServerError(payload.error)
          return
        }

        const delta = payload.content ?? payload.message?.content
        if (delta) {
          onContent(delta)
        }

        if (payload.done) {
          onComplete?.(payload)
          return
        }
      } catch {
        // Ignore malformed SSE payloads
      }

      boundary = buffer.indexOf('\n\n')
    }
  }

  const trailingData = extractEventData(buffer.trim())
  if (trailingData && trailingData !== '[DONE]') {
    try {
      const payload = JSON.parse(trailingData) as StreamEventPayload
      if (payload.error) {
        onServerError(payload.error)
      } else {
        const delta = payload.content ?? payload.message?.content
        if (delta) {
          onContent(delta)
        }
      }

      if (payload.done) {
        onComplete?.(payload)
      }
    } catch {
      // Ignore trailing garbage
    }
  }
}

function extractEventData(eventChunk: string) {
  return eventChunk
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace(/^data:\s*/, ''))
    .join('\n')
}
