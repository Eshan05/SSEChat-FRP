import { z } from "zod";

export const ChatMessage = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export type ChatMessage = z.infer<typeof ChatMessage>;

export const OllamaModel = z.object({
  name: z.string(),
  modified_at: z.string(),
  size: z.number(),
  digest: z.string(),
});

export type OllamaModel = z.infer<typeof OllamaModel>;

export const ChatRequest = z.object({
  model: z.string(),
  messages: z.array(ChatMessage),
});

export type ChatRequest = z.infer<typeof ChatRequest>;