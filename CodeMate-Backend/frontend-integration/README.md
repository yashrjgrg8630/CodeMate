# Frontend integration

Copy these files over your frontend (paths are relative to the app root; they overwrite the same-named mock files):

```bash
cp -r frontend-integration/src/. <your-app>/src/
cp frontend-integration/.env.example <your-app>/.env      # VITE_API_URL=http://localhost:8787
```

I verified this against your uploaded project: `tsc --noEmit` (with your strict flags), ESLint, and `vite build` all pass.

## What changed
* `services/client.ts` — real fetch client: cookies (`credentials: "include"`), one silent refresh-and-retry on 401, `ApiError` with the server's error code/message. `IS_MOCK_BACKEND = false`, so every **Mock data** badge disappears.
* `services/*Service.ts` — same exported function names and signatures, now calling the API. `SAMPLE_CODE` and `detectLanguage` are kept in `analysisService.ts`.
* `services/authService.ts` (new), `routes/login.tsx` (new, email/password + Google), `routes/_app.tsx` (redirects to `/login` when there is no session). Your app had no auth UI, and every API route requires a session, so this was necessary.
* `routes/_app.career.tsx` — the three mock calls became one `analyzeCareer()` request (the backend returns extraction + skill gap + roadmap together); adds error toasts; tells the user when the resume text was unreadable.
* `routes/_app.roadmap.tsx` — loads the saved roadmap (generates the first one on demand, so revisiting the page doesn't re-bill the AI) and saves checkbox state to the backend.
* `types/domain.ts` — `isMockData: boolean`, optional `BenchmarkResult.notes`, optional `DSARoadmap.id`.
* `routeTree.gen.ts` — regenerated so `/login` is a typed route.
* `getProgress()` sends the browser time zone so streaks and the Mon–Sun chart follow the user's calendar.

## Things to know
* Run frontend and API on the same site (e.g. `localhost:3000` + `localhost:8787`, or `app.example.com` + `api.example.com`) so `SameSite=Lax` cookies are sent. Set the backend's `FRONTEND_ORIGIN` to the exact frontend origin.
* Non-text resumes (PDF/DOCX) are still not parsed; the app sends a placeholder, the server treats it as "no resume", and the career page shows the analysis without the match roadmap.
* The route guard runs in the browser only (cookies aren't available during SSR), so protected pages may flash before redirecting.
