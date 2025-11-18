import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { RotateCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

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
import CapabilityIcons from '@/components/CapabilityIcons'
import ModelName, { getModelMeta } from '@/components/ModelName'
import { DEFAULT_MODEL } from '@/lib/api'
import { fetchModelInfo, fetchModels } from '@/lib/ollama'
import { useSelectedModel } from '@/components/SelectedModelProvider'

const numberFormatter = new Intl.NumberFormat()

export default function ModelSelector({ className }: { className?: string }) {
  const { model, setModel } = useSelectedModel()
  const queryClient = useQueryClient()
  const modelsQuery = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  })
  const infoQuery = useQuery({
    queryKey: ['model-info', model],
    queryFn: () => fetchModelInfo(model),
    staleTime: 1000 * 60 * 10,
    enabled: Boolean(model),
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (modelsQuery.isLoading || !modelsQuery.data?.length) {
      return
    }

    const modelNames = modelsQuery.data.map((candidate) => candidate.name)
    if (!modelNames.includes(model)) {
      setModel(modelsQuery?.data[0]!.name)
      return
    }

    let storedModel: string | null = null
    try {
      storedModel = localStorage.getItem('selectedModel')
    } catch {
      storedModel = null
    }

    if (!storedModel && !modelNames.includes(DEFAULT_MODEL)) {
      setModel(modelsQuery.data[0]!.name)
    }
  }, [modelsQuery.data, modelsQuery.isLoading, model, setModel])

  if (modelsQuery.isLoading) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        Loading models...
      </div>
    )
  }

  if (modelsQuery.error) {
    return (
      <div className={cn('text-sm text-destructive', className)}>
        Failed to load models
      </div>
    )
  }

  const models = modelsQuery.data ?? []
  const current = models.find((m) => m.name === model)
  const modelInfo = infoQuery.data
  const capabilities = modelInfo?.capabilities ?? []
  const parameterSummary = modelInfo?.parameters
    ? formatParameterSummary(modelInfo.parameters)
    : 'N/A'

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col">
          <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Model
          </span>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger size="sm" className="min-w-48">
              <SelectValue asChild>
                <div className="flex items-center gap-2">
                  {model ? <ModelName modelId={model} showIcon={false} /> : <span className="text-sm text-muted-foreground">Select a model</span>}
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {models.map((candidate) => (
                <SelectItem key={candidate.name} value={candidate.name}>
                  <div className="flex items-center gap-2">
                    <ModelName modelId={candidate.name} showIcon={false} />
                  </div>
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
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['models'] })
                if (model) {
                  queryClient.invalidateQueries({ queryKey: ['model-info', model] })
                }
              }}
              disabled={modelsQuery.isFetching}
            >
              <RotateCw
                className={cn(
                  'size-4',
                  (modelsQuery.isFetching || infoQuery.isFetching) && 'animate-spin',
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh models</TooltipContent>
        </Tooltip>

        {(modelsQuery.isFetching || infoQuery.isFetching) && (
          <span className="text-xs text-muted-foreground">Refreshing...</span>
        )}
      </div>

      {current && (
        <div className="space-y-3 rounded-lg border border-dashed border-border/60 bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <InfoCell label="Selected" value={<ModelName modelId={current.name} />} />
            <InfoCell label="Size" value={formatBytes(current.size)} />
            <InfoCell label="Updated" value={formatDateTime(current.modified_at)} />
            <InfoCell
              label="Context length"
              value={formatTokens(modelInfo?.contextLength)}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <InfoCell label="Provider" value={(() => {
              const meta = getModelMeta(current.name)
              return (
                <div className="flex items-center gap-2">
                  {meta?.icon}
                  <span className="text-sm font-medium text-foreground">{meta?.provider ?? 'Local'}</span>
                </div>
              )
            })()} />
            <InfoCell label="Param size" value={modelInfo?.parameterSize ?? 'N/A'} />
            <InfoCell
              label="Quantization"
              value={modelInfo?.quantizationLevel ?? 'N/A'}
            />
            <InfoCell
              label="Capabilities"
              value={<CapabilityIcons capabilities={capabilities} />}
            />
          </div>

          <InfoCell label="Parameters" value={parameterSummary} />
        </div>
      )}

      {!modelInfo && infoQuery.isLoading && (
        <span className="text-xs text-muted-foreground">Loading model details...</span>
      )}
    </div>
  )
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'N/A'
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

function formatTokens(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 'N/A'
  }

  return numberFormatter.format(value)
}

function formatDateTime(value: string) {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return 'N/A'
  }

  return new Date(timestamp).toLocaleString()
}

function formatCapabilities(items: string[]) {
  if (!items.length) {
    return 'N/A'
  }

  return items.slice(0, 4).join(', ')
}

function formatParameterSummary(parameters: Record<string, number | string>) {
  const priorityKeys = ['temperature', 'top_p', 'top_k', 'num_ctx', 'stop']
  const entries: string[] = []

  for (const key of priorityKeys) {
    if (Object.prototype.hasOwnProperty.call(parameters, key)) {
      const value = parameters[key]
      if (value !== undefined && value !== null && String(value).length > 0) {
        entries.push(`${key}=${value}`)
      }
    }
  }

  if (entries.length === 0) {
    return 'N/A'
  }

  return entries.slice(0, 4).join(', ')
}

function InfoCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="uppercase tracking-wide text-[0.65rem] text-muted-foreground/70">
        {label}
      </span>
      <span className="font-medium text-foreground wrap-break-word">{value}</span>
    </div>
  )
}
