import { useCallback, useMemo, useRef, useState } from 'react'
import ModelSelector from '../components/ModelSelector'

import { createFileRoute } from '@tanstack/react-router'

import type { ChatMessage } from '@pkg/zod'
import { useSelectedModel } from '../components/SelectedModelProvider'

import { API_BASE_URL } from '../lib/api'

export const Route = createFileRoute('/')({
  component: ChatPage,
})

type UIMessage = Pick<ChatMessage, 'role' | 'content'>

function ChatPage() {
  const { model: selectedModel } = useSelectedModel()
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
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
    [input, isStreaming, messages],
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
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex flex-col">
            <h1 className="text-3xl font-semibold tracking-tight">SSE Chat</h1>
            <p className="text-sm text-muted-foreground">{hintText}</p>
          </div>
          <div className="w-full sm:w-auto">
            <ModelSelector />
          </div>
        </header>

        <section className="flex flex-1 flex-col rounded-3xl border bg-card p-4 shadow-sm md:p-6">
          <div className="no-visible-scrollbar flex-1 space-y-3 overflow-y-auto rounded-2xl border bg-background/40 p-4">
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
                  <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
                    {message.role}
                  </p>
                  <p className="whitespace-pre-wrap text-left text-sm leading-relaxed">{message.content}</p>
                </article>
              ))
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                Start the conversation to see streaming responses.
              </div>
            )}
          </div>

          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <textarea
              className="w-full resize-none rounded-2xl border bg-card px-4 py-3 text-base shadow focus-visible:ring"
              placeholder="Type your prompt..."
              rows={3}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={isStreaming}
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!canSend}
                className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow disabled:opacity-60"
              >
                Send
              </button>

              {isStreaming && (
                <button
                  type="button"
                  onClick={stopStreaming}
                  className="rounded-full border border-border px-6 py-2 text-sm font-medium"
                >
                  Stop
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
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
        const payload = JSON.parse(data) as { content?: string; error?: string }

        if (payload.error) {
          onServerError(payload.error)
          return
        }

        if (payload.content) {
          onContent(payload.content)
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
      const payload = JSON.parse(trailingData) as { content?: string; error?: string }
      if (payload.error) {
        onServerError(payload.error)
      } else if (payload.content) {
        onContent(payload.content)
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
