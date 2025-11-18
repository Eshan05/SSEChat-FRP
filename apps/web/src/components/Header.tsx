import { Link } from '@tanstack/react-router'
import { Github, Home, Network, Sparkle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const navItems = [
  {
    to: '/',
    label: 'Chat',
    icon: Home,
  },
]

export default function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 text-foreground">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkle className="size-5" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">SSE Chat</span>
              <span className="text-xs text-muted-foreground">Fastify · TanStack</span>
            </div>
          </Link>
          <Separator orientation="vertical" className="hidden h-8 sm:block" />
        </div>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="hidden gap-2 rounded-full text-xs font-medium sm:inline-flex"
          >
            <a
              href="https://github.com/Eshan05/SSEChat-FRP"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="size-3.5" />
              View Source
            </a>
          </Button>
          <Button asChild variant="default" size="sm" className="rounded-full text-xs font-semibold">
            <Link to="/">Start chatting</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
