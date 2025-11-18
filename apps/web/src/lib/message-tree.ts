import type { ChatMessage } from '@pkg/zod'

export type MessageNode = ChatMessage & {
  children: string[]
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Build a map of ID -> MessageNode from a flat list of messages.
 * This also populates the 'children' array for each node based on parentId relationships.
 */
export function buildMessageTree(messages: ChatMessage[]): Map<string, MessageNode> {
  const tree = new Map<string, MessageNode>()

  // First pass: Create nodes
  messages.forEach((msg) => {
    tree.set(msg.id, { ...msg, children: [] })
  })

  // Second pass: Link children
  messages.forEach((msg) => {
    if (msg.parentId) {
      const parent = tree.get(msg.parentId)
      if (parent) {
        parent.children.push(msg.id)
      }
    }
  })

  return tree
}

/**
 * Get the linear path from root to a specific message (inclusive).
 * This is the context sent to the LLM.
 */
export function getMessagePath(tree: Map<string, MessageNode>, targetId: string | undefined): MessageNode[] {
  if (!targetId) return []

  const path: MessageNode[] = []
  let currentId: string | undefined = targetId

  while (currentId) {
    const node = tree.get(currentId)
    if (!node) break
    path.unshift(node)
    currentId = node.parentId ?? undefined
  }

  return path
}

/**
 * Find the leaf node for a given branch selection state.
 * 
 * @param tree The message tree
 * @param selectedBranches A map of parentId -> selectedChildId
 */
export function getActiveLeaf(
  tree: Map<string, MessageNode>,
  selectedBranches: Record<string, string>
): string | undefined {
  // Find root(s)
  const roots = Array.from(tree.values()).filter(n => !n.parentId)
  if (roots.length === 0) return undefined

  // If there are multiple roots (e.g. multiple system prompts or conversation starts),
  // we need a way to select the root. For now, assume 'root' key in selectedBranches or default to first.
  const rootId = selectedBranches['root'] ?? roots[0].id
  let current = tree.get(rootId)

  if (!current) return undefined

  while (true) {
    if (current.children.length === 0) {
      return current.id
    }

    // Determine which child to follow
    const selectedChildId = selectedBranches[current.id]
    let nextNode: MessageNode | undefined

    if (selectedChildId) {
      nextNode = tree.get(selectedChildId)
    }

    // If selection is invalid or not set, default to the last child (most recent)
    if (!nextNode) {
      const defaultChildId = current.children[current.children.length - 1]
      nextNode = tree.get(defaultChildId)
    }

    if (!nextNode) return current.id // Should not happen if children.length > 0
    current = nextNode
  }
}

/**
 * Get siblings of a message (including itself)
 */
export function getSiblings(tree: Map<string, MessageNode>, messageId: string): MessageNode[] {
  const node = tree.get(messageId)
  if (!node) return []

  if (!node.parentId) {
    // Root siblings
    return Array.from(tree.values()).filter(n => !n.parentId)
  }

  const parent = tree.get(node.parentId)
  if (!parent) return [node]

  return parent.children
    .map(id => tree.get(id))
    .filter((n): n is MessageNode => n !== undefined)
}
