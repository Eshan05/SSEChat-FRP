export type CompletionInfo = {
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

export type StreamEventPayload = {
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

export type SessionAnalytics = {
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
