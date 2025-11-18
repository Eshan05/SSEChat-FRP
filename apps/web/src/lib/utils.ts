import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseMessageContent(content: string) {
  const thinkTagStart = '<think>'
  const thinkTagEnd = '</think>'
  const thinkingTagStart = '[THINKING]'
  const thinkingTagEnd = '[/THINKING]'

  let reasoning: string | null = null
  let displayContent = content

  // Check for <think> tags first
  const thinkStartIndex = content.indexOf(thinkTagStart)
  if (thinkStartIndex !== -1) {
    const thinkEndIndex = content.indexOf(thinkTagEnd, thinkStartIndex)
    if (thinkEndIndex !== -1) {
      reasoning = content.substring(thinkStartIndex + thinkTagStart.length, thinkEndIndex)
      displayContent = content.substring(0, thinkStartIndex) + content.substring(thinkEndIndex + thinkTagEnd.length)
    } else {
      // Still thinking
      reasoning = content.substring(thinkStartIndex + thinkTagStart.length)
      displayContent = ''
    }
  } else {
    // Check for [THINKING] tags
    const thinkingStartIndex = content.indexOf(thinkingTagStart)
    if (thinkingStartIndex !== -1) {
      const thinkingEndIndex = content.indexOf(thinkingTagEnd, thinkingStartIndex)
      if (thinkingEndIndex !== -1) {
        reasoning = content.substring(thinkingStartIndex + thinkingTagStart.length, thinkingEndIndex)
        displayContent = content.substring(0, thinkingStartIndex) + content.substring(thinkingEndIndex + thinkingTagEnd.length)
      } else {
        // Still thinking
        reasoning = content.substring(thinkingStartIndex + thinkingTagStart.length)
        displayContent = ''
      }
    }
  }

  return { reasoning, content: displayContent.trim() }
}

