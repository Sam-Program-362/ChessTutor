# ChessTutor

ChessTutor is a focused chess practice room: play White against a client-side Stockfish WASM opponent and optionally receive move-by-move commentary from an OpenAI-compatible coach model.

## Stack

- Next.js App Router + TypeScript, ready for Vercel
- `chess.js` for legal move validation and PGN/FEN generation
- `react-chessboard` for the board UI
- `stockfish.js` WASM running in the browser (no engine requests leave the client)
- Neon serverless Postgres for users, settings, games, and moves
- Serverless `/api/coach` proxy so provider API keys never reach the browser

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app is intentionally previewable without environment variables. Without `DATABASE_URL`, it uses an in-memory demo store; add Neon variables for persistence.

## Neon setup

Run the migration against a Neon database:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

Set these Vercel project environment variables:

- `DATABASE_URL`: Neon pooled connection string
- `ENCRYPTION_KEY`: long random secret used for AES-256-GCM encryption of `ai_settings.api_key_encrypted`
- `DEMO_GITHUB_USERNAME`: optional demo identity until GitHub OAuth is connected

The `users` table and `user_id` scoping are ready for a GitHub OAuth session adapter. The initial product uses a clearly named demo player so the game loop works immediately; replacing `getCurrentUserId()` in `lib/auth.ts` with the authenticated GitHub user is the intended integration point.

## Coach configuration

Open **Settings**, enable **AI Coach**, then provide:

- an OpenAI-compatible base URL such as `https://api.openai.com/v1`
- the model name
- an API key
- Beginner, Intermediate, or Pro teaching style

The browser sends only board state, move history, and move metadata to `/api/coach`. The route reads the encrypted key server-side, prepends the fixed ChessTutor system prompt, calls the provider, and stores the returned commentary in `moves.coach_commentary`. The prompt explicitly prevents unsolicited next-move suggestions; hints are only allowed when the player asks for one.

## Deploy to Vercel

Import the GitHub repository under `Sam-program-362`, set the environment variables above, run `db/schema.sql` once, and deploy with the default Next.js build settings.
