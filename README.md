<div align="center">
  <br />
    <h1>💬 SSEChat</h1>
  <br />
  <div>
    <img src="https://img.shields.io/badge/-React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="react" />
    <img src="https://img.shields.io/badge/-Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="vite" />
    <img src="https://img.shields.io/badge/-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="typescript" />
    <img src="https://img.shields.io/badge/-Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="tailwindcss" />
    <img src="https://img.shields.io/badge/-Shadcn_UI-000000?style=for-the-badge&logo=shadcnui&logoColor=white" alt="shadcn" />
    <img src="https://img.shields.io/badge/-Fastify-000000?style=for-the-badge&logo=fastify&logoColor=white" alt="fastify" />
    <img src="https://img.shields.io/badge/-Ollama-FFFFFF?style=for-the-badge&logo=ollama&logoColor=black" alt="ollama" />
    <img src="https://img.shields.io/badge/-Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="docker" />
  </div>

  <h3 align="center"> Local AI Chat Interface with Tree-Based Conversations </h3>

   <div align="center">
     A modern, high-performance chat interface for local LLMs. Features real-time streaming, conversation branching, and deep analytics. Built for power users who want full control over their AI interactions.
    </div>
</div>

<br />

## ⚡ Overview

**SSEChat** is a robust full-stack application designed to interface seamlessly with [Ollama](https://ollama.com/). Unlike standard linear chat interfaces, SSEChat supports **conversation branching**, allowing you to explore multiple paths of thought from a single message. It leverages **Server-Sent Events (SSE)** for ultra-low latency streaming and includes a dedicated backend to handle connection pooling, resilience, and request management.

## 💻 Technologies

<div align="center">
  <img src="https://skillicons.dev/icons?i=react" alt="React" width="48" height="48" />
  <img src="https://skillicons.dev/icons?i=vite" alt="Vite" width="48" height="48" />
  <img src="https://skillicons.dev/icons?i=typescript" alt="TypeScript" width="48" height="48" />
  <img src="https://skillicons.dev/icons?i=tailwind" alt="Tailwind" width="48" height="48" />
  <img src="https://skillicons.dev/icons?i=nodejs" alt="Node.js" width="48" height="48" />
  <img src="https://skillicons.dev/icons?i=fastify" alt="Fastify" width="48" height="48" />
  <img src="https://skillicons.dev/icons?i=docker" alt="Docker" width="48" height="48" />
</div>

- Frontend: React, Vite, Tailwind CSS, TanStack Router & Query, Shadcn UI
- Backend: Node.js, Fastify, Zod
- Local LLM: Ollama
- Dev / Infra: Docker, pnpm, TypeScript

## 🚀 Features

- 🌳 **Conversation Branching**: Edit any user message to create a new "branch" of the conversation. Switch between branches instantly to compare model outputs.
- ⚡ **Real-Time Streaming**: Powered by Server-Sent Events (SSE) for immediate token generation without buffering.
- 🎨 **Rich Text Rendering**: Full Markdown support with **KaTeX** for math equations and **Shiki** for beautiful code syntax highlighting.
- 📊 **Analytics Dashboard**: Track token usage, generation speed, and model performance metrics.
- 🛡️ **Robust Backend**:
    - **Connection Pooling**: Efficiently manages connections to Ollama.
    - **Circuit Breaking**: Prevents cascading failures if the model hangs.
    - **Backpressure Handling**: Protects server memory during high-load streaming.
- 🐳 **Dockerized**: One-command setup for the entire stack.

## 🛠️ Getting Started

### Option 1: Docker (Recommended)

Ensure you have [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed.

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/SSEChat-FRP.git
    cd SSEChat-FRP
    ```

2.  **Configure Ollama**
    *   **Windows/Mac**: Ensure your local Ollama is running.
    *   **Linux**: You may need to uncomment the `ollama` service in `docker-compose.yml` or ensure your local instance is accessible.
    *   *Important*: Set `OLLAMA_HOST=0.0.0.0` in your system environment variables so the container can reach it.

3.  **Run the stack**
    ```bash
    docker compose up --build
    ```

4.  **Access the app**
    *   Frontend: `http://localhost:3000`
    *   Backend API: `http://localhost:3001`

### Option 2: Manual Setup (pnpm)

Prerequisites: Node.js 20+ and pnpm.

1.  **Install dependencies**
    ```bash
    pnpm install
    ```

2.  **Start the development servers**
    ```bash
    pnpm dev
    ```
    This will start both the Fastify backend (port 3001) and the Vite frontend (port 3000) in parallel.

## 📸 Screenshots

<div align="center">
  <img src="https://placehold.co/800x500/1e1e1e/FFF?text=Chat+Interface+Preview" alt="Chat Interface" />
</div>

## 📄 License

This project is licensed under the MIT License.
