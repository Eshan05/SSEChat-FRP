import { z } from "zod";

export const ChatMessage = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  id: z.string(),
  parentId: z.string().nullable().optional(),
  children: z.array(z.string()).default([]),
  createdAt: z.number().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessage>;

export const OllamaModel = z.object({
  name: z.string(),
  modified_at: z.string(),
  size: z.number(),
  digest: z.string(),
});

export type OllamaModel = z.infer<typeof OllamaModel>;

export const ChatRequestMessage = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  images: z.array(z.string()).optional(),
});

export type ChatRequestMessage = z.infer<typeof ChatRequestMessage>;

export const ChatRequest = z.object({
  model: z.string(),
  messages: z.array(ChatRequestMessage),
});

export type ChatRequest = z.infer<typeof ChatRequest>;