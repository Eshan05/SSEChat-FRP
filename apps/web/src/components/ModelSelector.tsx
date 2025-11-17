import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { OllamaModel } from '@pkg/zod'
import { DEFAULT_MODEL } from '../lib/api'
import { API_BASE_URL } from '../lib/api'
import { useSelectedModel } from './SelectedModelProvider'

async function fetchModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${API_BASE_URL}/models`)
  if (!res.ok) throw new Error('Failed to fetch models')
  const payload = await res.json()
  // The API returns { models: Array<...> } where each model may have a name property
  const models = (payload?.models ?? []) as OllamaModel[]
  return models
}

export default function ModelSelector({ className }: { className?: string }) {
  const { model, setModel } = useSelectedModel()
  const queryClient = useQueryClient()
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (!isLoading && data && data.length > 0) {
      const modelNames = data.map((m) => m.name)
      if (!modelNames.includes(model)) {
        // If the selected model does not exist in the list anymore, choose first
        setModel(data[0].name)
      }
      // If the current model equals a default env model which may not be present,
      // prefer the first model if the default isn't in the list
      if (!localStorage.getItem('selectedModel') && !modelNames.includes(DEFAULT_MODEL)) {
        setModel(data[0].name)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isLoading])

  if (isLoading) {
    return <div className={`text-sm ${className ?? ''}`}>Loading models…</div>
  }

  if (error) {
    return <div className={`text-sm text-red-500 ${className ?? ''}`}>Failed to load models</div>
  }

  const models = data ?? []
  const current = models.find((m) => m.name === model)

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <label className="text-xs text-muted-foreground">Model</label>
      <select
        aria-label="Select model"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="rounded-md border bg-white px-2 py-1 text-sm"
      >
        {models.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => queryClient.invalidateQueries(['models'])}
        title="Refresh models"
        className="ml-2 rounded border px-2 py-1 text-xs"
      >
        Refresh
      </button>
      {isFetching && <span className="text-xs text-muted-foreground">Refreshing…</span>}
      {current && (
        <div className="ml-2 text-xs text-muted-foreground">
          <div>Size: {current.size}</div>
          <div>Modified: {new Date(current.modified_at).toLocaleString()}</div>
        </div>
      )}
    </div>
  )
}
