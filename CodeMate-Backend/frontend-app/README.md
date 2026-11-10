# CodeMate AI frontend

React + TanStack Router frontend connected to the CodeMate Node.js API.

## Run locally

1. Start the backend on `http://localhost:8787`. Set its `FRONTEND_ORIGIN` to the
   exact frontend origin (Vite defaults to `http://localhost:5173`).
2. Copy `.env.example` to `.env` (the default API URL is already configured).
3. Install the frontend dependencies and start Vite:

   ```sh
   npm install
   npm run dev
   ```

The API uses HttpOnly access and refresh cookies. The frontend never reads or
stores JWTs; all API calls use `credentials: "include"`. Keep the frontend and
backend on the same site so the development `SameSite=Lax` cookies are sent,
and configure the backend's CORS origin to match the frontend exactly.

## Connected backend routes

- Authentication: `POST /api/auth/signup`, `/login`, `/logout`, `/refresh`;
  `GET /api/auth/me`. Protected requests attempt one refresh and retry after a
  `401`.
- Code tools: `POST /api/analysis`, `/optimization`, `/optimization/verify`,
  `/conversion`, `/benchmark`.
- Career and interview: `POST /api/career/job`, `/interview/start`,
  `/interview/evaluate`, `/interview/report`.
- Activity and learning: `GET /api/dashboard`, `/progress`, `/history`,
  `/roadmap/latest`; `POST /api/roadmap`; `PATCH
  /api/roadmap/:roadmapId/problems/:problemId`.

Request and response types in `src/types/domain.ts` mirror the backend's
Prisma/Zod API contract. Backend errors are shown as toast notifications;
dashboard, progress, history and roadmap queries also provide retry controls.

The backend has no profile or preference update endpoint, so settings that are
not account details remain local to the current page session. Resume uploads
are read as text in the browser; PDF/DOCX extraction is not currently
implemented by the API, so provide a `.txt`/`.md` resume or paste its text for
resume matching.
