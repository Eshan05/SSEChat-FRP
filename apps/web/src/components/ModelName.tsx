import type { ReactNode } from 'react'
import { Globe, Database, BoxIcon, SatelliteDishIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ModelMeta = {
  displayName: string
  provider?: string
  icon?: ReactNode
}

export const MODEL_NAME_MAP: Record<string, ModelMeta> = {
  // Example specific mapping
  'gemma3:4b': { displayName: 'Gemma 3 (4B)', provider: 'google', icon: <Globe className="size-4" /> },
  // Generic example—you can add more mappings here
}

function normalizeModelId(modelId: string) {
  return String(modelId).trim().toLowerCase()
}

export function formatModelName(modelId?: string) {
  if (!modelId) return 'Unknown model'
  const normalized = normalizeModelId(modelId)
  const mapped = MODEL_NAME_MAP[normalized]
  if (mapped) return mapped.displayName

  // Heuristic-based formatting: remove common version tokens (e.g., :latest),
  // treat size tokens like 4b as parentheses and join words otherwise.
  const [base, _ver] = normalized.split(':')
  const tokens = base?.split(/[\/_-]+/) ?? []
  // Filter out common version-like tokens e.g., latest, v1, patch
  const filtered = tokens.filter((t) => !/^(latest|v\d+|stable|beta)$/i.test(t))

  // If the first token is letters+digits e.g., gemma3 or smollm2
  const first = filtered[0] ?? ''
  const nameMatch = first.match(/^([a-zA-Z]+)(\d+)?$/)
  let head = ''
  const rest = filtered.slice(1)
  if (nameMatch) {
    const [, prefix, number] = nameMatch
    head = `${capitalize(prefix!)}${number ? ` ${number}` : ''}`
  } else {
    head = filtered[0] ? capitalize(filtered[0]) : ''
  }

  // Determine if any tokens indicate a size like 4b or 1b
  // Check version token for size (e.g., `4b`) first, fall back to tokens
  let sizeToken: string | undefined
  if (_ver && /^[0-9]+b$/i.test(_ver)) {
    sizeToken = _ver
  } else {
    const sizeTokenIndex = rest.findIndex((t) => /^[0-9]+b$/i.test(t))
    if (sizeTokenIndex >= 0) {
      sizeToken = rest.splice(sizeTokenIndex, 1)[0]
    }
  }

  // Build readable remainder name
  const remainder = rest.map((t) => t.replace(/[0-9]+b$/i, (s) => s.toUpperCase())).map(capitalize)
  const display = [head, ...remainder].filter(Boolean).join(' ')

  return sizeToken ? `${display} (${sizeToken.toUpperCase()})` : display || normalizeModelId(modelId)
}

export function getModelMeta(modelId?: string): ModelMeta | undefined {
  if (!modelId) return undefined
  const normalized = normalizeModelId(modelId)
  const mapped = MODEL_NAME_MAP[normalized]
  if (mapped) return mapped

  // Special-case provider path format `provider/model[:version]`
  let providerId: string | undefined
  let modelPath = normalized
  if (normalized.includes('/')) {
    const [p, ...rest] = normalized.split('/')
    providerId = p
    modelPath = rest.join('/')
  }

  // Provide friendly provider name and icon
  const providerName = providerId ? formatProviderName(providerId) : undefined
  const icon = getProviderIcon(providerName)
  const displayName = formatModelName(modelPath)
  return { displayName, provider: providerName, icon }
}

function inferProvider(normalized: string) {
  if (normalized.startsWith('gemma') || normalized.includes('gemma')) return 'google'
  if (normalized.startsWith('gpt') || normalized.includes('openai')) return 'openai'
  return 'local'
}

function formatProviderName(providerId: string) {
  const normalized = providerId.replace(/[_-]/g, ' ')
  const low = normalized.toLowerCase()
  if (low.includes('huihui')) return 'HuiHui AI'
  if (low.includes('gemma')) return 'Google'
  if (low.includes('openai') || low.includes('gpt')) return 'OpenAI'
  if (low.includes('ollama')) return 'Ollama'
  // Fallback: Title-case
  return normalized
    .split(/[\s]+/)
    .map((s) => (s ? s[0]?.toUpperCase() + s.slice(1) : s))
    .join(' ')
}

function getProviderIcon(providerName?: string) {
  if (!providerName) return undefined
  const low = providerName.toLowerCase()
  if (low.includes('google') || low.includes('gemma')) return <Globe className="size-4" />
  if (low.includes('openai') || low.includes('gpt')) return <SatelliteDishIcon className="size-4" />
  if (low.includes('huihui')) return <BoxIcon className="size-4" />
  if (low.includes('ollama')) return <Database className="size-4" />
  return undefined
}

function capitalize(value: string) {
  if (!value) return ''
  return value[0]?.toUpperCase() + value.slice(1)
}

export default function ModelName({
  modelId,
  showIcon = true,
  className,
  icon,
}: {
  modelId?: string
  showIcon?: boolean
  className?: string
  icon?: ReactNode
}) {
  const meta = getModelMeta(modelId)
  const display = meta?.displayName ?? formatModelName(modelId)
  const resolvedIcon = icon ?? meta?.icon

  return (
    <div className={cn('flex items-center gap-2 text-xs', className)}>
      {/* {showIcon && resolvedIcon && <span className="flex items-center">{resolvedIcon}</span>} */}
      <span className="text-sm font-medium text-foreground">{display}</span>
    </div>
  )
}
