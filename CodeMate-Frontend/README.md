# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev -- --port 5173 --strictPort
```

## Run with the CodeMate backend

The integrated frontend calls the sibling `codemate-backend` API at `http://localhost:8787`.
Create `.env.local` in this project with:

```dotenv
VITE_API_URL=http://localhost:8787
```

In the backend project, install dependencies and configure its ignored `.env` with a PostgreSQL
`DATABASE_URL`, a private `JWT_ACCESS_SECRET` (at least 32 characters), a `GEMINI_API_KEY`, and
`FRONTEND_ORIGIN=http://localhost:5173`. PostgreSQL must already be running; do not start a
container or database service without approval. Follow the backend README's Prisma client
generation and migration instructions, then start it with `npm run dev`. Start this frontend in a
separate terminal with `npm run dev -- --port 5173 --strictPort`.

Open `http://localhost:5173`, then sign in or create an account. Feature requests use the
authenticated backend session and account data is persisted by the API. Resume uploads accept
`.txt`, `.md`, and selectable-text `.pdf` files up to 10 MB. PDF text is extracted in the browser;
scanned/image-only PDFs and DOCX files are not supported.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
