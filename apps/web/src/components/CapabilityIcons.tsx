import { Image, Cpu, Wrench as Tool, Code, Database, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/mobile-tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const CAPABILITY_ICON_MAP: Record<string, { label: string; Icon: any }> = {
  vision: { label: 'Vision', Icon: Image },
  completion: { label: 'Completion', Icon: Cpu },
  tools: { label: 'Tools', Icon: Tool },
  embeddings: { label: 'Embeddings', Icon: Database },
  code: { label: 'Code', Icon: Code },
}

export default function CapabilityIcons({
  capabilities,
  className,
  size = 4,
}: {
  capabilities: string[]
  className?: string
  size?: number
}) {
  if (!capabilities || capabilities.length === 0) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>N/A</span>
    )
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {capabilities.map((cap) => {
        const key = String(cap).toLowerCase()
        const meta = CAPABILITY_ICON_MAP[key]
        const Icon = meta?.Icon ?? Info
        const label = meta?.label ?? cap

        return (
          <Tooltip key={cap}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7 rounded-full border border-border/60 p-1 text-muted-foreground"
                aria-label={label}
                title={label}
              >
                <Icon className={`size-${size}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

export { CAPABILITY_ICON_MAP }
