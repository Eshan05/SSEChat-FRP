import { useEffect } from 'react'
import { RotateCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { OllamaModel } from '@pkg/zod'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { API_BASE_URL, DEFAULT_MODEL } from '@/lib/api'
import { useSelectedModel } from '@/components/SelectedModelProvider'

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
    if (isLoading || !data?.length) {
      return
    }

    const modelNames = data.map((candidate) => candidate.name)
    if (!modelNames.includes(model)) {
      setModel(data[0].name)
      return
    }

    let storedModel: string | null = null
    try {
      storedModel = localStorage.getItem('selectedModel')
    } catch {
      storedModel = null
    }

    if (!storedModel && !modelNames.includes(DEFAULT_MODEL)) {
      setModel(data[0].name)
    }
  }, [data, isLoading, model, setModel])

  if (isLoading) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        Loading models…
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('text-sm text-destructive', className)}>
        Failed to load models
      </div>
    )
  }

  const models = data ?? []
  const current = models.find((m) => m.name === model)

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col">
          <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Model
          </span>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger size="sm" className="min-w-48">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {models.map((candidate) => (
                <SelectItem key={candidate.name} value={candidate.name}>
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Refresh models"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['models'] })}
              disabled={isFetching}
            >
              <RotateCw className={cn('size-4', isFetching && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh models</TooltipContent>
        </Tooltip>

        {isFetching && (
          <span className="text-xs text-muted-foreground">Refreshing…</span>
        )}
      </div>

      {current && (
        <div className="grid gap-1 rounded-lg border border-dashed border-border/60 bg-muted/50 px-3 py-2 text-xs text-muted-foreground sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <span className="uppercase tracking-wide text-[0.65rem] text-muted-foreground/70">
              Selected
            </span>
            <span className="font-medium text-foreground">{current.name}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="uppercase tracking-wide text-[0.65rem] text-muted-foreground/70">
              Size
            </span>
            <span>{formatBytes(current.size)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="uppercase tracking-wide text-[0.65rem] text-muted-foreground/70">
              Updated
            </span>
            <span>{new Date(current.modified_at).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '—'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** exponent
  const formatted = value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)
  return `${formatted} ${units[exponent]}`
}
