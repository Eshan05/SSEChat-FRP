import type { OllamaModel } from '@pkg/zod'

import { API_BASE_URL } from './api'

export type OllamaModelInfo = {
  model: string
  modifiedAt: string | null
  capabilities: string[]
  license: string | null
  parameters: Record<string, number | string>
  contextLength: number | null
  parameterSize: string | null
  quantizationLevel: string | null
  modelInfo: Record<string, unknown> | null
  details: Record<string, unknown> | null
}

export async function fetchModels(): Promise<OllamaModel[]> {
  const response = await fetch(`${API_BASE_URL}/models`)
  if (!response.ok) {
    throw new Error('Failed to fetch models')
  }

  const payload = await response.json()
  const models = (payload?.models ?? []) as OllamaModel[]
  return models
}

export async function fetchModelInfo(model: string): Promise<OllamaModelInfo> {
  const params = new URLSearchParams({ model })
  const response = await fetch(`${API_BASE_URL}/models/info?${params.toString()}`)

  if (!response.ok) {
    throw new Error('Failed to fetch model details')
  }

  const payload = await response.json()

  return {
    model: payload?.model ?? model,
    modifiedAt: payload?.modified_at ?? null,
    capabilities: Array.isArray(payload?.capabilities) ? payload.capabilities : [],
    license: typeof payload?.license === 'string' ? payload.license : null,
    parameters: (payload?.parameters ?? {}) as Record<string, number | string>,
    contextLength: typeof payload?.context_length === 'number' ? payload.context_length : null,
    parameterSize: payload?.parameter_size ?? null,
    quantizationLevel: payload?.quantization_level ?? null,
    modelInfo: (payload?.model_info as Record<string, unknown>) ?? null,
    details: (payload?.details as Record<string, unknown>) ?? null,
  }
}
