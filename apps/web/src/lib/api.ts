import { StreamEventPayload } from './chat-types'

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api'
export const DEFAULT_MODEL = import.meta.env.VITE_OLLAMA_MODEL ?? 'gemma3:1b'

export async function readErrorMessage(response: Response) {
  try {
    const payload = await response.json()
    return payload?.error ?? response.statusText
  } catch {
    return response.statusText || 'Request failed'
  }
}

export async function consumeEventStream(
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
