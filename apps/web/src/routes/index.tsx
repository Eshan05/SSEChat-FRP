import { useCallback, useMemo, useRef, useState, lazy, Suspense } from 'react'

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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Actions, Action } from '@/components/ui/shadcn-io/ai/actions'
import { API_BASE_URL, consumeEventStream, readErrorMessage } from '@/lib/api'
import { fetchModelInfo } from '@/lib/ollama'
import { cn, parseMessageContent } from '@/lib/utils'
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
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '@/components/ui/shadcn-io/ai/reasoning'
import { CompletionInfo, StreamEventPayload } from '@/lib/chat-types'
import { computeAnalytics } from '@/lib/analytics'
import { Skeleton } from '@/components/ui/skeleton'

// Lazy load components
const Response = lazy(() =>
  import('@/components/ui/shadcn-io/ai/response').then(mod => ({ default: mod.Response }))
)
const ResponseDetails = lazy(() => import('@/components/ResponseDetails'))
const AnalyticsSummary = lazy(() => import('@/components/AnalyticsSummary'))
const ContextPreview = lazy(() => import('@/components/ContextPreview'))

export const Route = createFileRoute('/')({
  component: ChatPage,
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
      parentId = targetAssistant.parentId!
    } else if (mode === 'user-regenerate') {
      const sourceUser = typeof options?.sourceIndex === 'number' ? activePath[options.sourceIndex] : undefined
      if (!sourceUser || sourceUser.role !== 'user') return
      parentId = sourceUser.parentId!
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
    let curr: string | null | undefined = assistantMessage.parentId
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
    const parentId = nextMessage?.parentId ?? 'root'

    setSelectedBranches(prev => ({ ...prev, [parentId]: nextMessage!.id }))
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
  const [contextPreviewOpen, setContextPreviewOpen] = useState(false)
  const [contextPreviewData, setContextPreviewData] = useState<any[]>([])

  const handleShowContext = useCallback(() => {
    const currentInput = input.trim()

    // Construct the context that would be sent
    const contextMessages = activePath.map(m => ({ role: m.role, content: m.content }))

    if (currentInput) {
      contextMessages.push({ role: 'user', content: currentInput })
    }

    setContextPreviewData(contextMessages)
    setContextPreviewOpen(true)
  }, [activePath, input])

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
                          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                            <AnalyticsSummary analytics={analytics} />
                          </Suspense>
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

                    const { reasoning, content: displayContent } = parseMessageContent(message.content)
                    const isLastMessage = index === activePath.length - 1
                    const isMessageStreaming = isStreaming && isLastMessage && message.role === 'assistant'
                    const info = messageInfo[message.id]
                    const duration = info?.totalDuration ? info.totalDuration / 1e9 : undefined

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
                              {message.role === 'user' && (
                                <Button size="sm" onClick={() => submitEditMessage(index)}>
                                  Save & Submit
                                </Button>
                              )}
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
                              {siblings.map((branch) => {
                                const { reasoning: branchReasoning, content: branchContent } = parseMessageContent(branch.content)
                                const branchInfo = messageInfo[branch.id]
                                const branchDuration = branchInfo?.totalDuration ? branchInfo.totalDuration / 1e9 : undefined
                                const isBranchStreaming = isStreaming && branch.id === activeLeafId

                                return (
                                  <div key={branch.id}>
                                    {branchReasoning && (
                                      <Reasoning isStreaming={isBranchStreaming} duration={branchDuration}>
                                        <ReasoningTrigger />
                                        <ReasoningContent>{branchReasoning}</ReasoningContent>
                                      </Reasoning>
                                    )}
                                    <Suspense
                                      fallback={
                                        <div className="animate-pulse text-sm text-muted-foreground">
                                          Loading...
                                        </div>
                                      }
                                    >
                                      <Response>{branchContent}</Response>
                                    </Suspense>
                                  </div>
                                )
                              })}
                            </BranchMessages>
                            <BranchSelector from={message.role}>
                              <BranchPrevious />
                              <BranchPage />
                              <BranchNext />
                            </BranchSelector>
                          </Branch>
                        ) : (
                          <>
                            {reasoning && (
                              <Reasoning isStreaming={isMessageStreaming} duration={duration}>
                                <ReasoningTrigger />
                                <ReasoningContent>{reasoning}</ReasoningContent>
                              </Reasoning>
                            )}
                            <Suspense
                              fallback={
                                <div className="animate-pulse text-sm text-muted-foreground">
                                  Loading...
                                </div>
                              }
                            >
                              <Response>{displayContent}</Response>
                            </Suspense>
                          </>
                        )}

                        <Actions className="mt-3 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Action
                              tooltip="Copy as plain text"
                              onClick={() => copyMessage(index, displayContent.replace(/[*_`~]/g, '').replace(/\n+/g, ' ').trim())}
                              variant={copiedIndex === index ? 'secondary' : 'ghost'}
                            >
                              <Copy className="size-4" />
                            </Action>
                            <Action
                              tooltip="Copy as markdown"
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
                              <Action
                                tooltip="Edit response"
                                onClick={() => startEditMessage(index, message.content)}
                                disabled={isStreaming}
                              >
                                <Edit3 className="size-4" />
                              </Action>
                            )}
                          </div>

                          <Separator orientation="vertical" className="h-6 mx-1" />

                          <div className="flex items-center gap-1">
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
                                  <Suspense fallback={<Skeleton className="h-20 w-40" />}>
                                    <ResponseDetails info={messageInfo[message.id]!} />
                                  </Suspense>
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
              onShowContext={handleShowContext}
            />
          </div>
        </div>
      </div>

      <Credenza open={contextPreviewOpen} onOpenChange={setContextPreviewOpen}>
        <CredenzaContent className="md:max-w-3xl h-[80vh] flex flex-col">
          <CredenzaHeader>
            <CredenzaTitle>Context Preview</CredenzaTitle>
          </CredenzaHeader>
          <CredenzaBody className="flex-1 overflow-hidden p-0 min-h-0">
            <div className="h-full overflow-auto p-4">
              <Suspense fallback={<Skeleton className="h-full w-full" />}>
                <ContextPreview data={contextPreviewData} />
              </Suspense>
            </div>
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>
    </main>
  )
}

