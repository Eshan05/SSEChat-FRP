import { type FastifyBaseLogger, type FastifyReply, FastifyPluginAsync } from 'fastify';
import axios, { type AxiosError } from 'axios';
import type { Readable } from 'node:stream';

import { ChatRequest } from '@pkg/zod';

const OLLAMA_BASE = 'http://127.0.0.1:11434';

type SSEEvent = string | { data: string; event?: string; id?: string };

const ollamaRoutes: FastifyPluginAsync = async (fastify) => {
  // Ensure CORS headers are set early for all plugin routes (helps with streaming)
  fastify.addHook('onRequest', (request, reply, done) => {
    const origin = (request.headers.origin as string | undefined) ?? '*';
    reply
      .header('Access-Control-Allow-Origin', origin)
      .header('Vary', 'Origin')
      .header('Access-Control-Allow-Credentials', 'true')
      .header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Content-Type, Accept');
    done();
  });
  fastify.get('/models', async (_request, reply) => {
    try {
      const response = await axios.get(`${OLLAMA_BASE}/api/tags`);
      return { models: response.data.models ?? [] };
    } catch (error) {
      fastify.log.error({ error }, 'Failed to fetch Ollama models');
      return reply.code(500).send({ error: 'Failed to fetch models' });
    }
  });

  fastify.get('/models/info', async (request, reply) => {
    const { model } = request.query as { model?: string };

    if (!model) {
      return reply.code(400).send({ error: 'Query parameter "model" is required' });
    }

    try {
      const response = await axios.post(`${OLLAMA_BASE}/api/show`, { model });
      const payload = response.data ?? {};
      const contextLength = extractContextLength(payload);
      const parsedParameters = parseParameterBlock(payload.parameters);

      return {
        model,
        modified_at: payload.modified_at ?? null,
        capabilities: Array.isArray(payload.capabilities) ? payload.capabilities : [],
        license: typeof payload.license === 'string' ? payload.license : null,
        parameters: parsedParameters,
        context_length: contextLength,
        parameter_size: payload.details?.parameter_size ?? null,
        quantization_level: payload.details?.quantization_level ?? null,
        model_info: payload.model_info ?? null,
        details: payload.details ?? null,
      };
    } catch (error) {
      const formattedError = formatOllamaError(error);
      fastify.log.error({ error: formattedError, cause: extractAxiosMeta(error) }, 'Failed to fetch model info');
      return reply.code(500).send({ error: formattedError });
    }
  });

  fastify.get('/models/:model', async (request, reply) => {
    const { model } = request.params as { model: string };

    try {
      const response = await axios({
        method: 'POST',
        url: `${OLLAMA_BASE}/api/show`,
        data: { model },
      });

      return response.data ?? null;
    } catch (error) {
      fastify.log.error({ error, model }, 'Failed to fetch Ollama model details');
      return reply.code(500).send({ error: 'Failed to fetch model details' });
    }
  });

  fastify.post('/chat', async (request, reply) => {
    const parseResult = ChatRequest.safeParse(request.body);

    if (!parseResult.success) {
      return reply.code(400).send({ error: parseResult.error.flatten() });
    }

    const { model, messages, options } = parseResult.data;

    // Log the messages being sent to Ollama
    fastify.log.info({ model, messageCount: messages.length, messages }, 'Sending chat request to Ollama');

    // Messages now include optional id, parentId, and branches for conversation branching
    const upstreamAbort = new AbortController();
    const requestOrigin = request.headers.origin;
    fastify.log.debug({ origin: requestOrigin }, 'Incoming chat request Origin');

    const eventSourceFactory = () =>
      (async function* (): AsyncGenerator<SSEEvent> {
        let upstream: Readable | null = null;
        const clientSocket = reply.raw;
        const handleClientClose = () => {
          upstream?.destroy();
          upstreamAbort.abort();
        };

        clientSocket.on('close', handleClientClose);

        try {
          const response = await axios({
            method: 'POST',
            url: `${OLLAMA_BASE}/api/chat`,
            data: { model, messages, options, stream: true },
            responseType: 'stream',
            signal: upstreamAbort.signal,
          });

          upstream = response.data as Readable;
          let buffer = '';

          for await (const chunk of upstream) {
            buffer += chunk.toString();

            let newlineIndex = buffer.indexOf('\n');
            while (newlineIndex !== -1) {
              const line = buffer.slice(0, newlineIndex).trim();
              buffer = buffer.slice(newlineIndex + 1);

              if (line.length > 0) {
                yield* parseOllamaLine(line, fastify.log);
              }

              newlineIndex = buffer.indexOf('\n');
            }
          }

          if (buffer.trim().length > 0) {
            yield* parseOllamaLine(buffer.trim(), fastify.log);
          }
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            const formattedError = formatOllamaError(error);
            fastify.log.error(
              { error: formattedError, details: extractAxiosMeta(error) },
              'Ollama stream failed',
            );
            yield { data: JSON.stringify({ error: formattedError }) } satisfies SSEEvent;
          }
        } finally {
          clientSocket.off('close', handleClientClose);
          upstream?.destroy();
        }
      })();

    return sendEventStream(reply, eventSourceFactory, requestOrigin);
  });
};

async function sendEventStream(
  reply: FastifyReply,
  sourceFactory: () => AsyncGenerator<SSEEvent>,
  corsOrigin?: string,
) {
  const enhancedReply = reply as FastifyReply & {
    sse?: (source: AsyncIterable<SSEEvent>) => FastifyReply;
  };

  if (corsOrigin) {
    reply.header('Access-Control-Allow-Origin', corsOrigin).header('Vary', 'Origin');
  } else {
    reply.header('Access-Control-Allow-Origin', '*');
  }
  reply
    .header('Access-Control-Allow-Credentials', 'true')
    .header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .header('Access-Control-Allow-Headers', 'Content-Type, Accept');

  // Do not use enhancedReply.sse() — always stream manually to control headers.

  reply
    .header('Content-Type', 'text/event-stream')
    .header('Cache-Control', 'no-cache')
    .header('Connection', 'keep-alive')
    .code(200);
  reply.raw.flushHeaders?.();
  // Log what header was set for debugging
  try {
    fastifyLogFromReply(reply, 'Access-Control-Allow-Origin');
  } catch { }

  for await (const event of sourceFactory()) {
    const payload = typeof event === 'string' ? event : event.data;
    reply.raw.write(`data: ${payload}\n\n`);
  }

  reply.raw.end();
  return reply;
}

function* parseOllamaLine(line: string, logger: FastifyBaseLogger) {
  try {
    const parsed = JSON.parse(line);

    if (parsed.message?.content) {
      yield {
        data: JSON.stringify({
          content: parsed.message.content,
          // Include message metadata if present in the original message
          id: (parsed.message as any)?.id,
          parentId: (parsed.message as any)?.parentId,
        })
      } satisfies SSEEvent;
    }

    if (parsed.done) {
      const {
        message,
        response,
        created_at: createdAt,
        done_reason: doneReason,
        total_duration: totalDuration,
        load_duration: loadDuration,
        prompt_eval_count: promptEvalCount,
        prompt_eval_duration: promptEvalDuration,
        eval_count: evalCount,
        eval_duration: evalDuration,
        model,
        done,
      } = parsed as {
        message?: unknown;
        response?: unknown;
        created_at?: string;
        done_reason?: string;
        total_duration?: number;
        load_duration?: number;
        prompt_eval_count?: number;
        prompt_eval_duration?: number;
        eval_count?: number;
        eval_duration?: number;
        model?: string;
        done?: boolean;
      };

      yield {
        data: JSON.stringify({
          done: done ?? true,
          model,
          created_at: createdAt,
          done_reason: doneReason,
          total_duration: totalDuration,
          load_duration: loadDuration,
          prompt_eval_count: promptEvalCount,
          prompt_eval_duration: promptEvalDuration,
          eval_count: evalCount,
          eval_duration: evalDuration,
          message,
          response,
        }),
      } satisfies SSEEvent;

      yield { data: '[DONE]' } satisfies SSEEvent;
    }
  } catch (error) {
    logger.warn({ error, line }, 'Unable to parse Ollama chunk');
  }
}

function extractContextLength(payload: Record<string, unknown>) {
  const candidates: Array<number | undefined> = [];

  const topLevel = payload['context_length'];
  if (typeof topLevel === 'number') {
    candidates.push(topLevel);
  }

  const details = payload['details'] as Record<string, unknown> | undefined;
  if (details && typeof details.context_length === 'number') {
    candidates.push(details.context_length as number);
  }

  const modelInfo = payload['model_info'] as Record<string, unknown> | undefined;
  if (modelInfo) {
    for (const [key, value] of Object.entries(modelInfo)) {
      if (typeof value === 'number' && /context_length|ctx_length|num_ctx/i.test(key)) {
        candidates.push(value);
      }
    }
  }

  const parametersBlock = typeof payload['parameters'] === 'string' ? (payload['parameters'] as string) : undefined;
  if (parametersBlock) {
    const parsed = parseParameterBlock(parametersBlock);
    const maybeKeys = ['num_ctx', 'ctx', 'context_length'];
    for (const key of maybeKeys) {
      const candidate = parsed[key];
      if (typeof candidate === 'number') {
        candidates.push(candidate);
        break;
      }
    }
  }

  return candidates.find((value) => typeof value === 'number' && Number.isFinite(value) && value > 0) ?? null;
}

function parseParameterBlock(parameters?: string) {
  const result: Record<string, number | string> = {};

  if (!parameters) {
    return result;
  }

  for (const rawLine of parameters.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const [key, ...rest] = line.split(/\s+/);
    if (!key) continue;

    const valueRaw = rest.join(' ');
    const numericValue = Number(valueRaw);
    if (!Number.isNaN(numericValue) && valueRaw.length > 0 && /^-?\d+(\.\d+)?$/.test(valueRaw)) {
      result[key] = numericValue;
    } else {
      result[key] = valueRaw ?? '';
    }
  }

  return result;
}

function formatOllamaError(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.data) {
      if (typeof error.response.data === 'string') {
        return error.response.data;
      }

      try {
        return JSON.stringify(error.response.data);
      } catch {
        return 'Upstream returned non-serializable payload.';
      }
    }

    if (error.code) {
      return `Ollama request failed (${error.code})`;
    }
  }

  return error instanceof Error ? error.message : 'Failed to connect to Ollama';
}

function extractAxiosMeta(error: unknown) {
  if (!axios.isAxiosError(error)) return undefined;

  const meta = {
    status: error.response?.status,
    statusText: error.response?.statusText,
    code: error.code,
    url: error.config?.url,
    method: error.config?.method,
  };

  return meta;
}

export default ollamaRoutes;

// helper to log the headers set on the reply when debugging
function fastifyLogFromReply(reply: FastifyReply, headerName: string) {
  try {
    // @ts-ignore
    const header = reply.getHeader?.(headerName) ?? (reply as any).getHeaders?.()[headerName];
    // eslint-disable-next-line no-console
    console.debug('Reply header set:', headerName, header);
  } catch (e) {
    // ignore
  }
}
