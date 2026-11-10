# CodeMate

CodeMate is an AI-powered coding companion application featuring a full-stack architecture with a React & TanStack Start frontend and a Node.js/TypeScript Hono backend powered by Google Gemini, Prisma, and PostgreSQL.

## Project Structure

- **`CodeMate-Frontend/`**: Client application built with React, TanStack Start, TypeScript, Tailwind CSS, and Vite.
- **`CodeMate-Backend/`**: Production REST API server built with Hono, TypeScript, Prisma (PostgreSQL), and Google Gemini AI services.

## Getting Started

### Prerequisites

- Node.js (v20+)
- npm or bun
- PostgreSQL 16+ (or Docker for `docker-compose.yml`)
- Google Gemini API key

### Backend Setup

1. Navigate to `CodeMate-Backend`:
   ```bash
   cd CodeMate-Backend
   ```
2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env to set DATABASE_URL, GEMINI_API_KEY, JWT_ACCESS_SECRET, etc.
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run migrations & start development server:
   ```bash
   npm run prisma:generate
   npm run prisma:deploy
   npm run dev
   ```

### Frontend Setup

1. Navigate to `CodeMate-Frontend`:
   ```bash
   cd CodeMate-Frontend
   ```
2. Configure environment:
   ```bash
   cp .env.example .env.local  # Set VITE_API_URL=http://localhost:8787
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start development server:
   ```bash
   npm run dev -- --port 5173 --strictPort
   ```
