/**
 * Utility functions for managing conversation branching
 */

export type MessageNode = {
  id: string
  parentId?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  branches: string[]
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Build a tree structure from flat message list
 */
export function buildMessageTree(messages: Array<{ id?: string; parentId?: string; role: string; content: string }>): Map<string, MessageNode> {
  const tree = new Map<string, MessageNode>()

  messages.forEach((msg, index) => {
    const id = msg.id ?? `msg_${index}`
    const node: MessageNode = {
      id,
      parentId: msg.parentId,
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
      branches: [],
    }
    tree.set(id, node)
  })

  // Build parent-child relationships
  tree.forEach((node) => {
    if (node.parentId) {
      const parent = tree.get(node.parentId)
      if (parent && !parent.branches.includes(node.id)) {
        parent.branches.push(node.id)
      }
    }
  })

  return tree
}

/**
 * Get the linear path from root to a specific message
 */
export function getMessagePath(tree: Map<string, MessageNode>, targetId: string): MessageNode[] {
  const path: MessageNode[] = []
  let currentId: string | undefined = targetId

  while (currentId) {
    const node = tree.get(currentId)
    if (!node) break
    path.unshift(node)
    currentId = node.parentId
  }

  return path
}

/**
 * Get all branches for a specific message
 */
export function getMessageBranches(tree: Map<string, MessageNode>, messageId: string): MessageNode[] {
  const node = tree.get(messageId)
  if (!node) return []

  return node.branches.map(branchId => tree.get(branchId)).filter((n): n is MessageNode => n !== undefined)
}

/**
 * Create a new branch from a parent message
 */
export function createBranch(parentId: string, role: 'user' | 'assistant' | 'system', content: string): MessageNode {
  return {
    id: generateMessageId(),
    parentId,
    role,
    content,
    branches: [],
  }
}
