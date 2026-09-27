# Track — Personal Fitness Intelligence

Track is a mobile-first, single-user personal fitness intelligence Progressive Web App (PWA). It transforms raw workout text copied directly from **Hevy** into structured workout records, objective strength/volume analytics, and longitudinal AI coaching powered by Google Gemini.

---

## Core Philosophy

- **Zero Fake Data:** All metrics, volume charts, personal records, and trends trace directly to real workouts stored in your database. No demo data, no placeholder metrics.
- **Single-User Architecture:** Built purely for personal use. Zero authentication friction, no social features, no multi-tenant overhead.
- **Phone-First UX:** Designed from the ground up for a 99% mobile usage profile with touch-friendly tap targets, safe-area insets, bottom navigation, and quick paste import.
- **Longitudinal Intelligence:** Rather than a simple chat wrapper, Track acts as a longitudinal coach that remembers patterns, hypotheses, and previous outcomes across training cycles.

---

## Architecture Overview

```
src/
├── app/
│   ├── page.tsx                 # "Today" dashboard: recent workouts, quick stats, quick import
│   ├── review/page.tsx          # Real-time parser preview, manual corrections, commit to DB
│   ├── workout/[id]/page.tsx    # Workout details, set breakdown, PR tags, comparison
│   ├── analyze/[id]/page.tsx    # Deep AI workout analysis, observations, hypotheses
│   ├── progress/page.tsx        # Longitudinal volume trends, muscle balance, PR timeline
│   ├── coach/page.tsx           # Longitudinal AI coach conversation & training memory
│   ├── exercise/[id]/page.tsx   # Per-exercise progression, estimated 1RM curves
│   ├── more/                    # Athlete profile, experiments, memory store, import logs
│   ├── api/                     # Server routes (import, workouts, coach, progress, memory)
│   └── globals.css              # Dark-mode design system & mobile touch foundations
├── ai/
│   ├── gemini-client.ts         # Server-side Gemini 2.5 Flash SDK client & embeddings
│   ├── prompts.ts               # System instructions, analysis prompts, memory prompts
│   ├── workout-analysis.ts      # Structured workout critique & candidate memory generator
│   ├── coach-chat.ts            # Contextual coach conversation engine
│   └── memory-extraction.ts     # Distillation of candidate memories into athlete knowledge
├── lib/
│   ├── parser.ts                # Deterministic Hevy plain-text parser (multi-format)
│   ├── analytics.ts             # Pure objective calculations (Volume, Epley 1RM, PRs, Consistency)
│   ├── schemas.ts               # Zod validation schemas for imports, sets, and AI responses
│   └── db.ts                    # Prisma Client singleton
└── components/
    ├── bottom-nav.tsx           # Native mobile app navigation bar
    ├── import-sheet.tsx         # Modal sheet for instant Hevy text paste
    └── providers.tsx            # React Query & UI context providers
```

---

## Prerequisites

- **Node.js**: v20 or higher
- **PostgreSQL Database**: Supabase or any standard PostgreSQL 15+ instance with the `pgvector` extension.
- **Gemini API Key**: Google AI Studio API key.

---

## Required Environment Variables

Create `.env.local` in the root directory:

```bash
# Google Gemini API Key (keep server-side only)
GEMINI_API_KEY="your-google-ai-studio-api-key"

# Database Connection URLs (e.g. Supabase Postgres)
# Transaction pooler or direct connection URL
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:6543/postgres?pgbouncer=true"

# Direct connection URL (required for migrations and schema push)
DIRECT_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
```

---

## Database & pgvector Setup

Track uses Prisma ORM with the PostgreSQL vector extension (`pgvector`) for storing and querying athlete memory embeddings.

### 1. Enable pgvector on PostgreSQL / Supabase

If using Supabase, enable the `vector` extension in the Supabase SQL Editor:

```sql
create extension if not exists vector with schema public;
```

### 2. Generate Prisma Client

```bash
npx prisma generate
```

### 3. Push Schema to Database

Push the schema directly to your Postgres database:

```bash
npx prisma db push
```

Alternatively, you can run migrations:

```bash
npx prisma migrate dev --name init
```

---

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser. (To simulate the mobile experience, open Chrome DevTools and select iPhone 15 / Pixel 8).

---

## Building & Deploying

To create an optimized production build:

```bash
npm run build
```

To run the production server locally:

```bash
npm run start
```

Deployable to Vercel, Railway, Fly.io, or any Node.js hosting platform with zero configuration.

---

## PWA Installation & Testing

Track is configured as a standalone Progressive Web App (PWA):
- `public/manifest.json`: Defines app icons, display mode (`standalone`), dark background `#0c0c0e`, and orientation.
- `public/sw.js`: Service worker providing offline asset caching and stale-while-revalidate strategies.
- `src/components/sw-register.tsx`: Automatic client-side service worker registration.

### Testing on iOS (Safari)
1. Open the deployed URL in Safari.
2. Tap the **Share** button (`⎙`).
3. Tap **Add to Home Screen**.
4. Launch Track from your Home Screen for full-screen native status bar experience.

### Testing on Android (Chrome)
1. Open the deployed URL in Chrome.
2. Tap the three dots menu or the **Install App** banner.
3. Launch Track from your launcher.

---

## Where Gemini Model & Prompts Are Configured

All AI features execute **strictly server-side** so your `GEMINI_API_KEY` is never bundled into client JavaScript.

- **Client & Model Settings:** Located in [`src/ai/gemini-client.ts`](src/ai/gemini-client.ts)
  - Default Model: `gemini-2.5-flash`
  - Embedding Model: `text-embedding-004`
- **System Instructions & Prompts:** Located in [`src/ai/prompts.ts`](src/ai/prompts.ts)
  - `COACH_SYSTEM_INSTRUCTION`: Defines the coach persona (objective, evidence-backed, sports science-grounded, zero fluff).
  - `WORKOUT_ANALYSIS_PROMPT`: Directs Gemini to critique workout performance against historical benchmarks.
  - `MEMORY_EXTRACTION_PROMPT`: Instructs the model to distill observations into athlete knowledge items without hallucination.

---

## How Athlete Memory Works

The memory system acts as the longitudinal backbone of Track:

1. **Extraction:** After a workout is saved and analyzed, [`src/ai/workout-analysis.ts`](src/ai/workout-analysis.ts) generates candidate memories (e.g., recovery bottlenecks, exercise volume ceilings, biomechanical notes).
2. **Review & Promotion:** Candidates enter as `CANDIDATE` status. The user or coach can confirm, reject, or supersede them in [`/more/memory`](/more/memory).
3. **Contextual Retrieval:** When asking the coach questions in [`/coach`](/coach) or generating workout reviews, active memories are assembled alongside the athlete profile and recent metrics into the prompt context.
4. **Hypotheses & Experiments:** Hypotheses (e.g., *"Triceps fatigue limits bench press lockout"*) can be converted into active experiments with tracked start dates, interventions, and causal outcome reviews.

---

## End-to-End Workflow

1. **Tap `+`** anywhere in the app to open the Hevy text import modal.
2. **Paste** workout text directly copied from Hevy.
3. **Review**: The deterministic parser automatically identifies the workout name, date, duration, exercises, sets, weights, reps, and PRs. Fix any missing attributes in the review table.
4. **Save**: The workout is saved to PostgreSQL, and derived metrics (total volume, sets, reps, intensity) are calculated.
5. **Analyze**: Run Gemini AI analysis to receive evidence-based feedback, exercise comparisons, and candidate memories.
6. **Track Over Time**: Return to **Progress** to view real volume progression, muscle balance, and personal record timelines.
#   t r a c k  
 