import { useCallback, useMemo, useRef, useState } from 'react'

import { createFileRoute } from '@tanstack/react-router'

import { Info } from 'lucide-react'
import type { ChatMessage } from '@pkg/zod'

import ModelSelector from '@/components/ModelSelector'
import { useSelectedModel } from '@/components/SelectedModelProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { API_BASE_URL } from '@/lib/api'

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

function ChatPage() {
  const { model: selectedModel } = useSelectedModel()
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [messageInfo, setMessageInfo] = useState<Record<number, CompletionInfo>>({})
  const abortControllerRef = useRef<AbortController | null>(null)

  const canSend = input.trim().length > 0 && !isStreaming
  const hasMessages = messages.length > 0

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const prompt = input.trim()
      if (!prompt || isStreaming) return

      const userMessage: UIMessage = { role: 'user', content: prompt }
      const conversation = [...messages, userMessage]
      const assistantIndex = conversation.length

      setMessages([...conversation, { role: 'assistant', content: '' }])
      setInput('')
      setError(null)
      setIsStreaming(true)
      setMessageInfo((previous) => {
        const next = { ...previous }
        delete next[assistantIndex]
        return next
      })

      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const response = await fetch(`${API_BASE_URL}/chat`, {
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
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
              },
            }))
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
      }
    },
    [input, isStreaming, messages, selectedModel],
  )

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

  return (
    <div className="flex min-h-screen justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-col">
            <h1 className="text-3xl font-semibold tracking-tight">SSE Chat</h1>
            <p className="text-sm text-muted-foreground">{hintText}</p>
          </div>
          <div className="w-full sm:w-auto">
            <ModelSelector />
          </div>
        </header>

        <Card className="flex flex-1 flex-col">
          <CardContent className="flex flex-1 flex-col gap-4">
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
            <form onSubmit={handleSubmit} className="w-full space-y-3">
              <Textarea
                className="min-h-28 rounded-2xl bg-card"
                placeholder="Type your prompt..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={isStreaming}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={!canSend}>
                  Send
                </Button>

                {isStreaming && (
                  <Button type="button" variant="outline" onClick={stopStreaming}>
                    Stop
                  </Button>
                )}
              </div>
            </form>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

function ResponseDetails({ info }: { info: CompletionInfo }) {
  const fields: Array<{ label: string; value: string }> = [
    { label: 'Model', value: info.model ?? '—' },
    { label: 'Done reason', value: info.doneReason ?? '—' },
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
    return '—'
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
    return '—'
  }

  const formattedCount = integerFormatter.format(count)
  const formattedDuration = formatDuration(duration)
  return duration ? `${formattedCount} • ${formattedDuration}` : formattedCount
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
