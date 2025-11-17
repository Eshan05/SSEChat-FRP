import { useCallback, useMemo, useRef, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import {
  Check,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  StopCircle,
  Wand2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { fetchModelInfo, fetchModels, type OllamaModelInfo } from '@/lib/ollama'
import { useSelectedModel } from '@/components/SelectedModelProvider'

const MAX_VISIBLE_ATTACHMENTS = 3

interface ChatComposerProps {
  inputValue: string
  onInputChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  canSend: boolean
  isStreaming: boolean
  attachments: File[]
  onAttachmentsChange: (files: File[]) => void
  modelInfo: OllamaModelInfo | null | undefined
}

export function ChatComposer({
  inputValue,
  onInputChange,
  onSubmit,
  onStop,
  canSend,
  isStreaming,
  attachments,
  onAttachmentsChange,
  modelInfo,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [autoMode, setAutoMode] = useState(false)
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false)
  const { model: selectedModel, setModel } = useSelectedModel()

  const { data: models, isLoading: modelsLoading, isFetching: modelsFetching } = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  })

  useQuery({
    queryKey: ['model-info', selectedModel],
    queryFn: () => fetchModelInfo(selectedModel),
    staleTime: 1000 * 60 * 10,
    enabled: Boolean(selectedModel),
  })

  const canAttach = useMemo(() => {
    if (!modelInfo?.capabilities?.length) {
      return false
    }

    return modelInfo.capabilities.some((capability) => capability.toLowerCase() === 'vision')
  }, [modelInfo?.capabilities])

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      onAttachmentsChange(files)
    },
    [onAttachmentsChange],
  )

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (canSend) {
        onSubmit()
      }
    },
    [canSend, onSubmit],
  )

  const handleCommandSelect = useCallback(
    (value: string) => {
      setModel(value)
      setIsModelPickerOpen(false)
    },
    [setModel],
  )

  const visibleAttachments = attachments.slice(0, MAX_VISIBLE_ATTACHMENTS)
  const remainingAttachments = attachments.length - visibleAttachments.length

  return (
    <div className="flex w-full flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={handleFileSelect}
        disabled={!canAttach}
      />

      <div className="rounded-2xl border border-border/80 bg-card/80 shadow-sm">
        <div className="px-4 pt-4">
          <form onSubmit={handleSubmit}>
            <Textarea
              value={inputValue}
              onChange={(event) => {
                onInputChange(event.target.value)
                const target = event.target
                target.style.height = 'auto'
                target.style.height = `${target.scrollHeight}px`
              }}
              placeholder={canAttach ? 'Ask anything or drop a file' : 'Ask anything'}
              className="w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              rows={1}
            />
          </form>
        </div>

        {attachments.length > 0 && (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap gap-2">
              {visibleAttachments.map((file) => (
                <span
                  key={`${file.name}-${file.lastModified}`}
                  className="rounded-full border border-border/70 bg-muted/60 px-3 py-1 text-xs text-muted-foreground"
                >
                  {file.name}
                </span>
              ))}
              {remainingAttachments > 0 && (
                <span className="rounded-full border border-border/70 bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
                  +{remainingAttachments} more
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-3 pb-3 pt-2">
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7 rounded-full border border-border"
                >
                  <Plus className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-w-xs rounded-2xl p-1.5">
                <DropdownMenuGroup className="space-y-1">
                  <DropdownMenuItem
                    className="rounded-lg text-xs"
                    onClick={() => canAttach && fileInputRef.current?.click()}
                    disabled={!canAttach}
                  >
                    <Paperclip className="size-3.5 opacity-60" />
                    Attach files
                    {!canAttach && <span className="ml-auto text-[0.65rem] uppercase text-muted-foreground">Vision required</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-lg text-xs" disabled>
                    <Sparkles className="size-3.5 opacity-60" />
                    Coming soon
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAutoMode((previous) => !previous)}
              className={cn(
                'h-7 gap-1 rounded-full border border-border px-3 text-xs',
                autoMode ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
              )}
            >
              <Wand2 className="size-3.5" />
              Auto
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {isStreaming && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 rounded-full border-destructive/40 text-xs text-destructive"
                onClick={onStop}
              >
                <StopCircle className="size-3.5" />
                Stop
              </Button>
            )}
            <Button
              type="submit"
              disabled={!canSend}
              className="h-9 w-9 rounded-full p-0"
              onClick={onSubmit}
            >
              {isStreaming ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-1">
        <Popover open={isModelPickerOpen} onOpenChange={setIsModelPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-full border border-border/60 px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              <Search className="size-3.5" />
              {selectedModel || 'Select model'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search models" />
              <CommandList>
                <CommandEmpty>No models found.</CommandEmpty>
                <CommandGroup heading="Available models">
                  {modelsLoading && (
                    <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Loading models…
                    </div>
                  )}
                  {models?.map((model) => (
                    <CommandItem
                      key={model.name}
                      value={model.name}
                      onSelect={handleCommandSelect}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{model.name}</span>
                        {model.name === selectedModel && <Check className="size-4" />}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatModelMetadata(model.size, model.modified_at)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-full border border-transparent px-2 text-xs text-muted-foreground"
            >
              <Sparkles className="size-3.5" />
              {autoMode ? 'Auto responses on' : 'Manual control'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Auto mode will adaptively rewrite prompts.</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <CapabilityBadge label="Vision" active={canAttach} />
          <CapabilityBadge label="Capabilities" value={modelInfo?.capabilities?.join(', ')} />
          <CapabilityBadge label="Context" value={formatContextLength(modelInfo?.contextLength)} />
        </div>

        {modelsFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>
    </div>
  )
}

function CapabilityBadge({
  label,
  value,
  active,
}: {
  label: string
  value?: string | number | null
  active?: boolean
}) {
  const displayValue = typeof value === 'string' && value.trim().length > 0 ? value : undefined

  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded-full border border-border/60 px-2 py-1 text-[0.65rem] uppercase tracking-wide',
        active ? 'text-primary border-primary/40' : 'text-muted-foreground',
      )}
    >
      {label}
      {displayValue && <span className="normal-case text-muted-foreground/80">{displayValue}</span>}
    </span>
  )
}

function formatModelMetadata(size: number, modifiedAt: string) {
  const formattedSize = formatBytes(size)
  const formattedDate = formatDate(modifiedAt)
  return `${formattedSize} · ${formattedDate}`
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '—'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  const formatted = value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)
  return `${formatted} ${units[exponent]}`
}

function formatDate(value: string) {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp))
}

function formatContextLength(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return 'N/A'
  }

  return new Intl.NumberFormat().format(value)
}
