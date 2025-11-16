import Fastify from 'fastify';
import cors from '@fastify/cors';
import ollamaRoutes from './src/routes/ollama.ts';

async function main() {
  const fastify = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  await fastify.register(cors, {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  });

  await fastify.register(ollamaRoutes, { prefix: '/api' });

  fastify.get('/health', async () => ({ status: 'ok' }));

  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log('🚀 Backend running on http://localhost:3001');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

void main();