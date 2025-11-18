import { useCallback, useMemo, useRef, useState, lazy, Suspense, type ReactNode } from 'react'

import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import {
  Info,
  Sparkles,
  Copy,
  RefreshCcw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Volume2,
  Edit3,
} from 'lucide-react'
import type { ChatMessage } from '@pkg/zod'

import { ChatComposer } from '@/components/ChatComposer'
import { useSelectedModel } from '@/components/SelectedModelProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Credenza,
  CredenzaTrigger,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaBody,
} from '@/components/ui/credenza'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Actions, Action } from '@/components/ui/shadcn-io/ai/actions'
import { API_BASE_URL } from '@/lib/api'
import { fetchModelInfo } from '@/lib/ollama'
import { cn } from '@/lib/utils'
import {
  buildMessageTree,
  getActiveLeaf,
  getMessagePath,
  getSiblings,
  generateMessageId
} from '@/lib/message-tree'
import {
  Branch,
  BranchMessages,
  BranchSelector,
  BranchPrevious,
  BranchNext,
  BranchPage,
} from '@/components/ui/shadcn-io/ai/branch'

// Lazy load the Response component to reduce initial bundle size
const Response = lazy(() =>
  import('@/components/ui/shadcn-io/ai/response').then(mod => ({ default: mod.Response }))
)

export const Route = createFileRoute('/')({
  component: ChatPage,
})

type CompletionInfo = {
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

type StreamEventPayload = {
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

const integerFormatter = new Intl.NumberFormat()
const decimalFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
})

function ChatPage() {
  const { model: selectedModel } = useSelectedModel()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [messageInfo, setMessageInfo] = useState<Record<string, CompletionInfo>>({})
  const [attachments, setAttachments] = useState<File[]>([])

  // Map of parentId -> selectedChildId. 'root' is the key for root messages.
  const [selectedBranches, setSelectedBranches] = useState<Record<string, string>>({})

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const pendingResponseStart = useRef<Record<string, number>>({})
  const abortControllerRef = useRef<AbortController | null>(null)

  const canSend = input.trim().length > 0 && !isStreaming
  const hasMessages = messages.length > 0

  // Build the tree structure from the flat list of messages
  const tree = useMemo(() => buildMessageTree(messages), [messages])

  // Determine the active leaf based on selected branches
  const activeLeafId = useMemo(() => getActiveLeaf(tree, selectedBranches), [tree, selectedBranches])

  // Get the full path from root to the active leaf
  const activePath = useMemo(() => getMessagePath(tree, activeLeafId), [tree, activeLeafId])

  type SendPromptOptions = {
    mode?: 'standard' | 'assistant-regenerate' | 'user-regenerate'
    sourceIndex?: number
    promptOverride?: string
  }

  const sendPrompt = useCallback(async (options?: SendPromptOptions) => {
    const mode = options?.mode ?? 'standard'
    const prompt = (options?.promptOverride ?? input).trim()
    if ((!prompt && mode !== 'assistant-regenerate') || isStreaming) return

    let parentId: string | undefined
    let currentMessages = [...messages]

    // Determine insertion point
    if (mode === 'assistant-regenerate') {
      const targetAssistant = typeof options?.sourceIndex === 'number' ? activePath[options.sourceIndex] : undefined
      if (!targetAssistant || targetAssistant.role !== 'assistant') return
      parentId = targetAssistant.parentId
    } else if (mode === 'user-regenerate') {
      const sourceUser = typeof options?.sourceIndex === 'number' ? activePath[options.sourceIndex] : undefined
      if (!sourceUser || sourceUser.role !== 'user') return
      parentId = sourceUser.parentId
    } else {
      // Standard: append to active leaf
      parentId = activeLeafId
    }

    // Create User Message (if not assistant-regenerate)
    if (mode !== 'assistant-regenerate') {
      const userMessage: ChatMessage = {
        role: 'user',
        content: prompt,
        id: generateMessageId(),
        parentId,
        children: [],
        createdAt: Date.now()
      }

      // Update parent to include this child
      if (parentId) {
        currentMessages = currentMessages.map(m =>
          m.id === parentId
            ? { ...m, children: [...m.children, userMessage.id] }
            : m
        )
        // Auto-select this new branch
        setSelectedBranches(prev => ({ ...prev, [parentId!]: userMessage.id }))
      } else {
        // Root
        setSelectedBranches(prev => ({ ...prev, 'root': userMessage.id }))
      }

      currentMessages.push(userMessage)
      parentId = userMessage.id // Next message (assistant) will be child of this user message
    }

    // Create Assistant Message
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      id: generateMessageId(),
      parentId,
      children: [],
      createdAt: Date.now()
    }

    // Update parent (User message or previous User message)
    if (parentId) {
      currentMessages = currentMessages.map(m =>
        m.id === parentId
          ? { ...m, children: [...m.children, assistantMessage.id] }
          : m
      )
      // Auto-select this new assistant branch
      setSelectedBranches(prev => ({ ...prev, [parentId!]: assistantMessage.id }))
    }

    currentMessages.push(assistantMessage)
    setMessages(currentMessages)

    if (mode === 'standard') {
      setInput('')
      setAttachments([])
    }

    setError(null)
    setIsStreaming(true)

    const assistantId = assistantMessage.id
    setMessageInfo((previous) => {
      const next = { ...previous }
      delete next[assistantId]
      return next
    })
    pendingResponseStart.current[assistantId] = performance.now()

    const controller = new AbortController()
    abortControllerRef.current = controller

    // Prepare conversation history for the API
    // We need the path up to the new assistant message (excluding the empty assistant message itself for now, or including it?)
    // Usually APIs expect the history including the user prompt.
    // The 'activePath' won't update immediately in this callback scope, so we construct it manually or wait for effect.
    // But we need to send request NOW.

    // Reconstruct path for the API request
    // We can use the 'parentId' chain we just built.
    const conversationForApi: ChatMessage[] = []
    let curr: string | undefined = assistantMessage.parentId
    while (curr) {
      const msg = currentMessages.find(m => m.id === curr)
      if (msg) {
        conversationForApi.unshift(msg)
        curr = msg.parentId
      } else {
        break
      }
    }
    // Add the empty assistant message if needed? Usually not for the prompt.
    // But if we are regenerating, we might need context.
    // Ollama expects messages: [{role, content}].

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: conversationForApi.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      if (!response.body) {
        throw new Error('Streaming is not supported in this environment.')
      }

      await consumeEventStream(
        response.body,
        (delta) => {
          setMessages((previous) => {
            return previous.map(m =>
              m.id === assistantId
                ? { ...m, content: m.content + delta }
                : m
            )
          })
        },
        (message) => {
          setError(message)
        },
        (metadata: StreamEventPayload) => {
          const startedAt = pendingResponseStart.current[assistantId]
          const responseTimeMs =
            typeof startedAt === 'number' ? performance.now() - startedAt : undefined
          const evalSeconds =
            typeof metadata.eval_duration === 'number' && metadata.eval_duration > 0
              ? metadata.eval_duration / 1e9
              : undefined
          const tokensPerSecond =
            evalSeconds && metadata.eval_count
              ? metadata.eval_count / evalSeconds
              : undefined

          setMessageInfo((previous) => ({
            ...previous,
            [assistantId]: {
              model: metadata.model,
              doneReason: metadata.done_reason,
              totalDuration: metadata.total_duration,
              loadDuration: metadata.load_duration,
              promptEvalCount: metadata.prompt_eval_count,
              promptEvalDuration: metadata.prompt_eval_duration,
              evalCount: metadata.eval_count,
              evalDuration: metadata.eval_duration,
              responseTimeMs,
              tokensPerSecond,
            },
          }))
          delete pendingResponseStart.current[assistantId]
        },
      )
    } catch (exception) {
      if ((exception as DOMException)?.name === 'AbortError') {
        return
      }

      const fallbackMessage =
        exception instanceof Error ? exception.message : 'Unexpected error'
      setError(fallbackMessage)
    } finally {
      abortControllerRef.current = null
      setIsStreaming(false)
      delete pendingResponseStart.current[assistantId]
    }
  }, [input, isStreaming, messages, selectedModel, activePath, activeLeafId])

  const regenerateResponse = useCallback((atIndex: number) => {
    if (isStreaming || atIndex < 0 || atIndex >= activePath.length) return

    const currentMessage = activePath[atIndex]
    if (!currentMessage) return

    if (currentMessage.role === 'assistant') {
      void sendPrompt({
        mode: 'assistant-regenerate',
        sourceIndex: atIndex,
      })
      return
    }
  }, [isStreaming, activePath, sendPrompt])

  const copyMessage = useCallback((index: number, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    })
  }, [])

  const deleteMessage = useCallback((index: number) => {
    const messageToDelete = activePath[index]
    if (!messageToDelete) return

    // Delete the node and all its children from 'messages'.
    const idsToDelete = new Set<string>()
    const collectIds = (id: string) => {
      idsToDelete.add(id)
      messages.filter(m => m.parentId === id).forEach(child => collectIds(child.id))
    }
    collectIds(messageToDelete.id)

    setMessages((prev) => {
      // Also need to remove the deleted ID from its parent's children array
      const parentId = messageToDelete.parentId
      let newMessages = prev.filter((m) => !idsToDelete.has(m.id))

      if (parentId) {
        newMessages = newMessages.map(m =>
          m.id === parentId
            ? { ...m, children: m.children.filter(childId => childId !== messageToDelete.id) }
            : m
        )
      }
      return newMessages
    })
  }, [activePath, messages])

  const startEditMessage = useCallback((index: number, content: string) => {
    setEditingIndex(index)
    setEditContent(content)
  }, [])

  const saveEditMessage = useCallback((index: number) => {
    if (!editContent.trim()) return

    const messageToUpdate = activePath[index]
    if (!messageToUpdate) return

    setMessages((prev) => prev.map(m =>
      m.id === messageToUpdate.id
        ? { ...m, content: editContent }
        : m
    ))
    setEditingIndex(null)
    setEditContent('')
  }, [editContent, activePath])

  const submitEditMessage = useCallback((index: number) => {
    if (!editContent.trim()) return

    void sendPrompt({
      mode: 'user-regenerate',
      sourceIndex: index,
      promptOverride: editContent
    })

    setEditingIndex(null)
    setEditContent('')
  }, [editContent, sendPrompt])

  const cancelEdit = useCallback(() => {
    setEditingIndex(null)
    setEditContent('')
  }, [])

  const navigateBranch = useCallback((message: ChatMessage, direction: 'prev' | 'next') => {
    const siblings = getSiblings(tree, message.id)
    if (siblings.length <= 1) return

    const currentIndex = siblings.findIndex(m => m.id === message.id)
    if (currentIndex === -1) return

    const nextIndex = direction === 'next'
      ? (currentIndex + 1) % siblings.length
      : (currentIndex - 1 + siblings.length) % siblings.length

    const nextMessage = siblings[nextIndex]
    const parentId = nextMessage.parentId ?? 'root'

    setSelectedBranches(prev => ({ ...prev, [parentId]: nextMessage.id }))
  }, [tree])

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const hintText = useMemo(
    () =>
      isStreaming
        ? 'Streaming response'
        : 'Ensure Ollama is served beforehand.',
    [isStreaming],
  )

  const { data: modelInfo } = useQuery({
    queryKey: ['model-info', selectedModel],
    queryFn: () => fetchModelInfo(selectedModel),
    staleTime: 1000 * 60 * 10,
    enabled: Boolean(selectedModel),
    refetchOnWindowFocus: false,
  })

  const [credenzaOpen, setCredenzaOpen] = useState(false)
  const analytics = useMemo(
    () => computeAnalytics(messageInfo, modelInfo?.contextLength ?? null),
    [messageInfo, modelInfo?.contextLength],
  )

  return (
    <main className="flex min-h-screen w-full justify-center bg-muted/30 px-4 my-2">
      <div className="flex w-full max-w-5xl flex-col gap-6 h-full">
        <section className="overflow-hidden rounded-xl border border-border/60 bg-card/80 p-4 backdrop-blur-md shadow-xl sticky top-4 z-10">
          <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">

              <div className="space-y-0">
                <h1 className="text-3xl font-medium tracking-tighter">
                  SSE Streaming Chat
                </h1>
                <p className="text-xs text-muted-foreground">
                  {hintText}
                </p>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="rounded-full border-primary/60 bg-primary/10 text-primary">
                    <Sparkles className="size-3.5" />
                    Local AI Powered Chat
                  </Badge>
                  <div className="flex flex-col items-start">
                    <Credenza open={credenzaOpen} onOpenChange={setCredenzaOpen}>
                      <CredenzaTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Session analytics">
                          <Info className="size-4" />
                        </Button>
                      </CredenzaTrigger>
                      <CredenzaContent className="md:max-w-4/5 lg:max-w-3/5">
                        <CredenzaHeader>
                          <CredenzaTitle>Session Analytics</CredenzaTitle>
                        </CredenzaHeader>
                        <CredenzaBody className='overflow-y-auto py-6'>
                          <AnalyticsSummary analytics={analytics} />
                        </CredenzaBody>
                      </CredenzaContent>
                    </Credenza>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="pointer-events-none absolute -right-24 top-1/2 hidden h-56 w-56 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl sm:block" />
        </section>

        <Card className="flex shadow-none flex-1 flex-col border-0 backdrop-blur bg-transparent overflow-hidden">
          <CardContent className="flex flex-1 flex-col gap-4">
            <ScrollArea className="flex-1 rounded-2xl overflow-auto pb-40">
              <div className="flex min-h-80 flex-col gap-3 p-4">
                {hasMessages ? (
                  activePath.map((message, index) => {
                    const siblings = getSiblings(tree, message.id)
                    const hasBranches = siblings.length > 1
                    const currentBranchIndex = siblings.findIndex(m => m.id === message.id)
                    const isEditing = editingIndex === index

                    return (
                      <article
                        key={message.id}
                        className={cn(
                          'relative rounded-2xl px-4 py-3 shadow transition-all',
                          message.role === 'user'
                            ? 'ml-auto max-w-[85%] bg-primary text-primary-foreground'
                            : 'mr-auto max-w-[85%] bg-secondary text-secondary-foreground'
                        )}
                      >
                        <div className="mb-1 flex items-start justify-between gap-3">
                          <p className="text-xs uppercase tracking-widest text-muted-foreground">
                            {message.role}
                          </p>
                        </div>

                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full min-h-20 p-2 rounded bg-background/50 text-foreground"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => submitEditMessage(index)}>
                                Save & Submit
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => saveEditMessage(index)}>
                                Save Only
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEdit}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : hasBranches ? (
                          <Branch
                            defaultBranch={currentBranchIndex}
                            onBranchChange={(branchIndex) => {
                              const target = siblings[branchIndex]
                              if (target) {
                                const parentId = target.parentId ?? 'root'
                                setSelectedBranches(prev => ({ ...prev, [parentId]: target.id }))
                              }
                            }}
                          >
                            <BranchMessages>
                              {siblings.map((branch) => (
                                <Suspense
                                  key={branch.id}
                                  fallback={
                                    <div className="animate-pulse text-sm text-muted-foreground">
                                      Loading...
                                    </div>
                                  }
                                >
                                  <Response>{branch.content}</Response>
                                </Suspense>
                              ))}
                            </BranchMessages>
                            <BranchSelector from={message.role}>
                              <BranchPrevious />
                              <BranchPage />
                              <BranchNext />
                            </BranchSelector>
                          </Branch>
                        ) : (
                          <Suspense
                            fallback={
                              <div className="animate-pulse text-sm text-muted-foreground">
                                Loading...
                              </div>
                            }
                          >
                            <Response>{message.content}</Response>
                          </Suspense>
                        )}

                        <Actions className="mt-3 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Action
                              tooltip={copiedIndex === index ? 'Copied!' : 'Copy'}
                              onClick={() => copyMessage(index, message.content)}
                              variant={copiedIndex === index ? 'secondary' : 'ghost'}
                            >
                              <Copy className="size-4" />
                            </Action>
                            {message.role === 'user' && (
                              <Action
                                tooltip="Edit message"
                                onClick={() => startEditMessage(index, message.content)}
                                disabled={isStreaming}
                              >
                                <Edit3 className="size-4" />
                              </Action>
                            )}
                            {message.role === 'assistant' && (
                              <Action tooltip="Text-to-speech" onClick={() => { }}>
                                <Volume2 className="size-4" />
                              </Action>
                            )}
                          </div>

                          <Separator orientation="vertical" className="h-6 mx-1" />

                          <div className="flex items-center gap-1">
                            {message.role === 'assistant' && (
                              <Action
                                tooltip="Regenerate"
                                onClick={() => regenerateResponse(index)}
                                disabled={isStreaming}
                              >
                                <RefreshCcw className="size-4" />
                              </Action>
                            )}
                            {hasBranches && (
                              <>
                                <Action
                                  tooltip="Previous response"
                                  onClick={() => navigateBranch(message, 'prev')}
                                >
                                  <ChevronLeft className="size-4" />
                                </Action>
                                <span className="text-xs text-muted-foreground px-1">
                                  {currentBranchIndex + 1} / {siblings.length}
                                </span>
                                <Action
                                  tooltip="Next response"
                                  onClick={() => navigateBranch(message, 'next')}
                                >
                                  <ChevronRight className="size-4" />
                                </Action>
                              </>
                            )}
                          </div>

                          <Separator orientation="vertical" className="h-6 mx-1" />

                          <div className="flex items-center gap-1">
                            {message.role === 'assistant' && messageInfo[message.id] && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Action tooltip="View details">
                                    <Info className="size-4" />
                                  </Action>
                                </TooltipTrigger>
                                <TooltipContent align="end" className="max-w-xs">
                                  <ResponseDetails info={messageInfo[message.id]} />
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Action
                              tooltip="Delete"
                              onClick={() => deleteMessage(index)}
                              disabled={isStreaming}
                            >
                              <Trash2 className="size-4" />
                            </Action>
                          </div>
                        </Actions>
                      </article>
                    )
                  })
                ) : (
                  <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
                    Start the conversation to see streaming responses.
                  </div>
                )}
              </div>
            </ScrollArea>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-auto">
        <div className="w-full max-w-5xl px-4 m-2 sm:px-0">
          <div className="mx-auto w-full backdrop-blur-md">
            <ChatComposer
              inputValue={input}
              onInputChange={setInput}
              onSubmit={() => {
                void sendPrompt()
              }}
              onStop={stopStreaming}
              canSend={canSend}
              isStreaming={isStreaming}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              modelInfo={modelInfo}
            />
          </div>
        </div>
      </div>
    </main>
  )
}

function ResponseDetails({ info }: { info: CompletionInfo }) {
  const totalTokens = (info.promptEvalCount ?? 0) + (info.evalCount ?? 0)
  const tokensPerSecond =
    typeof info.tokensPerSecond === 'number' && Number.isFinite(info.tokensPerSecond)
      ? info.tokensPerSecond
      : undefined
  const responseTime =
    typeof info.responseTimeMs === 'number' && info.responseTimeMs > 0
      ? info.responseTimeMs
      : typeof info.totalDuration === 'number' && info.totalDuration > 0
        ? info.totalDuration / 1e6
        : undefined

  const fields: Array<{ label: string; value: string }> = [
    { label: 'Model', value: info.model ?? 'N/A' },
    {
      label: 'Response time',
      value: responseTime ? formatMilliseconds(responseTime) : 'N/A',
    },
    { label: 'Input tokens', value: formatTokens(info.promptEvalCount) },
    { label: 'Output tokens', value: formatTokens(info.evalCount) },
    { label: 'Total tokens', value: formatTokens(totalTokens) },
    {
      label: 'Tokens / second',
      value: tokensPerSecond ? formatRate(tokensPerSecond, 'tok/s') : 'N/A',
    },
    { label: 'Done reason', value: info.doneReason ?? 'N/A' },
    { label: 'Total duration', value: formatDuration(info.totalDuration) },
    { label: 'Load duration', value: formatDuration(info.loadDuration) },
    {
      label: 'Prompt tokens',
      value: formatCountWithDuration(info.promptEvalCount, info.promptEvalDuration),
    },
    {
      label: 'Response tokens',
      value: formatCountWithDuration(info.evalCount, info.evalDuration),
    },
  ]

  return (
    <div className="grid gap-1 text-xs">
      {fields.map((field) => (
        <div key={field.label} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{field.label}</span>
          <span className="font-medium text-foreground">{field.value}</span>
        </div>
      ))}
    </div>
  )
}

function formatDuration(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 'N/A'
  }

  const seconds = value / 1e9
  if (seconds >= 1) {
    return `${seconds.toFixed(2)} s`
  }

  const milliseconds = seconds * 1e3
  if (milliseconds >= 1) {
    return `${milliseconds.toFixed(1)} ms`
  }

  const microseconds = seconds * 1e6
  if (microseconds >= 1) {
    return `${microseconds.toFixed(1)} us`
  }

  return `${value.toFixed(0)} ns`
}

function formatCountWithDuration(count?: number, duration?: number) {
  if (typeof count !== 'number') {
    return 'N/A'
  }

  const formattedCount = integerFormatter.format(count)
  if (typeof duration === 'number' && duration > 0) {
    return `${formattedCount} (${formatDuration(duration)})`
  }

  return formattedCount
}

function formatTokens(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 'N/A'
  }

  return integerFormatter.format(value)
}

function formatMilliseconds(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`
  }

  if (value >= 1) {
    return `${value.toFixed(0)} ms`
  }

  return `${(value * 1000).toFixed(0)} us`
}

function formatRate(value: number, unit: string) {
  if (!Number.isFinite(value) || value <= 0) {
    return 'N/A'
  }

  if (value >= 100) {
    return `${value.toFixed(0)} ${unit}`
  }

  if (value >= 10) {
    return `${value.toFixed(1)} ${unit}`
  }

  return `${value.toFixed(2)} ${unit}`
}

function formatPercentage(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 'N/A'
  }

  if (value === 0) {
    return '0%'
  }

  if (value >= 100) {
    return `${value.toFixed(1)}%`
  }

  if (value >= 1) {
    return `${value.toFixed(1)}%`
  }

  return `${value.toFixed(2)}%`
}

type SessionAnalytics = {
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

function computeAnalytics(
  infoRecord: Record<string, CompletionInfo>,
  contextWindow: number | null,
): SessionAnalytics {
  const sorted = Object.entries(infoRecord)
    .map(([id, info]) => ({ id, info }))
    .filter((entry) => entry.info)
  // We can't easily sort by index anymore since we use IDs. 
  // But for analytics, maybe order doesn't matter as much, or we can rely on insertion order if JS object preserves it (mostly yes).
  // Or we could add a timestamp to CompletionInfo.
  // For now, let's just use the values.

  const lastEntry = sorted.length > 0 ? sorted[sorted.length - 1] : undefined
  const lastInfo = lastEntry?.info
  const promptTokens = typeof lastInfo?.promptEvalCount === 'number' ? lastInfo.promptEvalCount : 0
  const lastOutputTokens = typeof lastInfo?.evalCount === 'number' ? lastInfo.evalCount : 0
  const totalOutputTokens = sorted.reduce((sum, entry) => {
    return sum + (entry.info.evalCount ?? 0)
  }, 0)
  const contextTokens = promptTokens + lastOutputTokens

  const totalEvalDurationSeconds = sorted.reduce((sum, entry) => {
    const { evalDuration } = entry.info
    if (typeof evalDuration === 'number' && evalDuration > 0) {
      return sum + evalDuration / 1e9
    }
    return sum
  }, 0)

  const tokensPerSecond =
    totalEvalDurationSeconds > 0 && totalOutputTokens > 0
      ? totalOutputTokens / totalEvalDurationSeconds
      : undefined

  const lastTokensPerSecond =
    lastInfo && typeof lastInfo.evalDuration === 'number' && lastInfo.evalDuration > 0 && typeof lastInfo.evalCount === 'number'
      ? lastInfo.evalCount / (lastInfo.evalDuration / 1e9)
      : undefined

  const responseTimes = sorted
    .map(({ info }) => {
      if (typeof info.responseTimeMs === 'number' && info.responseTimeMs > 0) {
        return info.responseTimeMs
      }
      if (typeof info.totalDuration === 'number' && info.totalDuration > 0) {
        return info.totalDuration / 1e6
      }
      return undefined
    })
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  const averageResponseTimeMs = responseTimes.length
    ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length
    : undefined

  const lastResponseTimeMs = responseTimes.length
    ? responseTimes[responseTimes.length - 1]
    : undefined

  const averageTokensPerMessage =
    sorted.length > 0 ? totalOutputTokens / sorted.length : undefined

  const contextUsagePercent =
    contextWindow && contextWindow > 0
      ? (contextTokens / contextWindow) * 100
      : undefined

  return {
    totalMessages: sorted.length,
    promptTokens,
    totalOutputTokens,
    contextTokens,
    averageTokensPerMessage,
    tokensPerSecond,
    lastTokensPerSecond,
    averageResponseTimeMs,
    lastResponseTimeMs,
    contextWindow: contextWindow ?? null,
    contextUsagePercent,
  }
}

function AnalyticsSummary({ analytics }: { analytics: SessionAnalytics }) {
  const {
    promptTokens,
    totalOutputTokens,
    contextTokens,
    averageTokensPerMessage,
    tokensPerSecond,
    lastTokensPerSecond,
    averageResponseTimeMs,
    lastResponseTimeMs,
    contextWindow,
    contextUsagePercent,
    totalMessages,
  } = analytics

  const tokenRateAverage = numericOrNull(tokensPerSecond)
  const tokenRateLast = numericOrNull(lastTokensPerSecond)
  const tokenRateProgress = computeProgress(tokenRateAverage ?? tokenRateLast, TOKEN_RATE_TARGET)
  const tokenRateDelta = describeDelta(tokenRateAverage, tokenRateLast)

  const responseAverage = numericOrNull(averageResponseTimeMs)
  const responseLast = numericOrNull(lastResponseTimeMs)
  const responseProgress = computeProgress(responseAverage ?? responseLast, RESPONSE_TARGET_MS)
  const responseDelta = describeDelta(responseAverage, responseLast, { inverse: true })

  const contextPercentRaw = numericOrNull(contextUsagePercent)
  const contextPercent = contextPercentRaw != null ? clamp(contextPercentRaw, 0, 100) : null
  const averageTokensDisplay =
    typeof averageTokensPerMessage === 'number' && Number.isFinite(averageTokensPerMessage)
      ? decimalFormatter.format(averageTokensPerMessage)
      : 'N/A'

  const contextLimit = typeof contextWindow === 'number' && contextWindow > 0 ? contextWindow : null

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-muted/40">
      <div className="grid grid-cols-1 gap-px bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Token throughput</span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground"></span>
          </div>
          <div className="text-2xl font-semibold text-foreground">
            {tokenRateAverage != null ? formatRate(tokenRateAverage, 'tok/s') : 'N/A'}
          </div>
          <Progress value={tokenRateProgress} className="h-1.5 bg-muted" />
          <div className="flex items-center justify-between text-xs -mt-1 uppercase tracking-wide text-muted-foreground">
            <span>0</span>
            <span>200</span>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Average</span>
              <span className="text-foreground">
                {tokenRateAverage != null ? formatRate(tokenRateAverage, 'tok/s') : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-2">
                Last
                {tokenRateDelta && (
                  <span className={cn('font-medium', deltaVariantClass(tokenRateDelta.variant))}>
                    {tokenRateDelta.label}
                  </span>
                )}
              </span>
              <span className="text-foreground">
                {tokenRateLast != null ? formatRate(tokenRateLast, 'tok/s') : 'N/A'}
              </span>
            </div>
          </div>
        </StatTile>

        <StatTile className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Response latency</span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground"></span>
          </div>
          <div className="text-2xl font-semibold text-foreground">
            {responseAverage != null ? formatMilliseconds(responseAverage) : 'N/A'}
          </div>
          <Progress value={responseProgress} className="h-1.5 bg-muted" />
          <div className="flex items-center justify-between -mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            <span>0</span>
            <span>{formatMilliseconds(RESPONSE_TARGET_MS)}</span>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Average</span>
              <span className="text-foreground">
                {responseAverage != null ? formatMilliseconds(responseAverage) : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-2">
                Last
                {responseDelta && (
                  <span className={cn('font-medium', deltaVariantClass(responseDelta.variant))}>
                    {responseDelta.label}
                  </span>
                )}
              </span>
              <span className="text-foreground">
                {responseLast != null ? formatMilliseconds(responseLast) : 'N/A'}
              </span>
            </div>
          </div>
        </StatTile>

        <StatTile>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Prompt tokens</span>
          <span className="text-xs text-muted-foreground -mt-2">
            Average tokens / M:{' '}
            <span className="text-foreground">{averageTokensDisplay}</span>
          </span>
          <span className="text-2xl font-semibold text-foreground">{formatTokens(promptTokens)}</span>
        </StatTile>

        <StatTile>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Output tokens</span>
          <span className="text-xs text-muted-foreground -mt-2">
            Total turns:{' '}
            <span className="text-foreground">{totalMessages}</span>
          </span>
          <span className="text-2xl font-semibold text-foreground">{formatTokens(totalOutputTokens)}</span>
        </StatTile>

        <StatTile className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Context usage</span>
            <span className="text-xs font-medium text-muted-foreground">
              {contextPercent != null ? formatPercentage(contextPercent) : 'N/A'}
            </span>
          </div>
          <div className="text-2xl font-semibold text-foreground">
            {contextPercent != null ? formatPercentage(contextPercent) : 'N/A'}
          </div>
          <Progress value={contextPercent ?? 0} className="h-1.5 bg-muted" />
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground -mt-1">
            <span>0 tokens</span>
            <span>
              {contextLimit ? `${formatTokens(contextLimit)} limit` : 'Window unknown'}
            </span>
          </div>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Context Tokens / Max</span>
              <span className="text-foreground">
                {contextLimit ? `${formatTokens(contextTokens)} / ${formatTokens(contextLimit)}` : formatTokens(contextTokens)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Prompt</span>
              <span className="text-foreground">{formatTokens(promptTokens)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Output</span>
              <span className="text-foreground">{formatTokens(totalOutputTokens)}</span>
            </div>
          </div>
        </StatTile>
      </div>
    </div>
  )
}

const TOKEN_RATE_TARGET = 200
const RESPONSE_TARGET_MS = 2000

type DeltaVariant = 'positive' | 'negative' | 'neutral'

function describeDelta(
  baseline: number | null,
  comparison: number | null,
  options: { inverse?: boolean } = {},
): { label: string; variant: DeltaVariant } | null {
  const { inverse = false } = options
  if (
    baseline == null ||
    comparison == null ||
    !Number.isFinite(baseline) ||
    !Number.isFinite(comparison) ||
    baseline === 0
  ) {
    return null
  }

  const delta = comparison - baseline
  const percent = (delta / baseline) * 100

  if (!Number.isFinite(percent)) {
    return null
  }

  const arrow = delta === 0 ? '→' : delta > 0 ? '↑' : '↓'
  const formattedPercent = Math.abs(percent) >= 10 ? percent.toFixed(1) : percent.toFixed(2)
  const label = `${arrow} ${delta > 0 ? '+' : ''}${formattedPercent}%`
  let variant: DeltaVariant = 'neutral'

  if (delta !== 0) {
    const improvement = inverse ? delta <= 0 : delta >= 0
    variant = improvement ? 'positive' : 'negative'
  }

  return { label, variant }
}

function deltaVariantClass(variant: DeltaVariant) {
  switch (variant) {
    case 'positive':
      return 'text-emerald-500'
    case 'negative':
      return 'text-red-500'
    default:
      return 'text-muted-foreground'
  }
}

function StatTile({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-3 bg-background/90 p-4 sm:p-6', className)}>
      {children}
    </div>
  )
}

function numericOrNull(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function computeProgress(value: number | null, target: number) {
  if (value == null || !Number.isFinite(value) || target <= 0) {
    return 0
  }

  return clamp((value / target) * 100, 0, 100)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

async function readErrorMessage(response: Response) {
  try {
    const payload = await response.json()
    return payload?.error ?? response.statusText
  } catch {
    return response.statusText || 'Request failed'
  }
}

async function consumeEventStream(
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
