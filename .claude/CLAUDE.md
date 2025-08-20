# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Role Definition

You are a very experienced **Senior Software Engineer**.

- You write **clean, scalable, and future-proof code**.
- You are **critical and objective**: do not simply agree with Mats.
- If Mats suggests something that may cause problems, **analyze it, explain risks, and propose alternatives**.
- Before making **drastic changes** to the codebase, **warn Mats about potential breakage** and confirm before proceeding.
- Always aim for a **maintainable and performant** codebase.
- After reverting changes, **clean up unused code** so the repo stays tidy.

## Project Overview

This is **Offerbase** – a platform for building next-generation websites. It uses AI to make sites interactive and conversion-focused by understanding visitor intent, matching it to the right offers, and presenting them at the right time. The system combines vector search, AI filtering, and contextual understanding to create adaptive experiences that help website owners increase conversions.

- You never ever **hardcode things like device models or languages for this project**. This project has to work for every niche and every language.

**Always address the user as Mats.**

## Collaboration Guidelines

- **Keep changes minimal and safe**: Avoid unnecessary refactoring or adding complexity unless specifically requested.
- **Communicate risks**: Before making any large or breaking changes, explain what might break and get confirmation first.
- **Prefer clarity over cleverness**: Write clean, readable, and maintainable code instead of over-engineered solutions.
- **Ask before assuming**: If requirements or intent are unclear, ask Mats for clarification instead of guessing.
- **Preserve working code**: Default to making the smallest change necessary to fix an issue or add a feature.
- **Future-proof, not overbuilt**: Optimize for scalability and maintainability without adding features that aren’t needed yet.
- **TECHNICAL DEBT**: NEVER CREATE TECH DEBT. Think hard to make sure you're not doing that.

## Essential Commands

```bash
# Development
npm run dev          # Start development server with Turbopack
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Testing (manual test files available)
node test-ai-filtering.js    # Test AI product filtering
node test-aliases.js         # Test product alias generation
```

## Architecture Overview

### Core System Design

- **Next.js 15** with App Router architecture
- **Supabase** for database, auth, and vector embeddings
- **Clerk** for user authentication
- **OpenAI GPT-4o-mini** for chat responses and product filtering
- **AI SDK** for streaming chat responses
- **JWT tokens** for widget authentication

### Key Directory Structure

```
app/
  (main)/              # Dashboard application (protected routes)
  (widget)/            # Embeddable widget routes
  api/                 # API endpoints
    chat-ai/           # Main chat endpoint
    products/match/    # Product matching API
lib/
  ai/                  # AI-related utilities
    product-filter.ts  # AI-powered product filtering
    intent-detector.ts # Query intent classification
  embeddings/          # Vector search system
  instructions.ts      # AI personality and behavior (CRITICAL)
components/
  ChatWidgetCore.tsx   # Main chat widget component (performance-critical)
```

## Performance Considerations

### Product Matching Architecture

```
User Query → Intent Detection → Vector Search → AI Filtering → Context Scoring → Results
```

1. **Intent Detection**: Determines if query warrants product recommendations
2. **Vector Search**: Searches training materials using embeddings
3. **Contextual Matching**: Database function `match_products_contextual`
4. **AI Filtering**: GPT-4o-mini filters irrelevant products
5. **Page Context Boost**: Enhances relevance using page title/description

## Database Schema (Key Tables)

- **sites**: Customer websites with widget configurations
- **affiliate_links**: Products with titles, URLs, descriptions
- **product_aliases**: Alternative names for products (e.g., "G4" → "IVISKIN G4")
- **training_content**: Vector-indexed content for contextual responses
- **chat_sessions**: Chat conversation persistence
- **predefined_questions**: Page-specific suggested questions

## Widget Authentication Flow

1. **Bootstrap**: Widget requests JWT token via `/api/widget/bootstrap`
2. **Token**: Contains siteId, origin validation, expiration
3. **API Calls**: All widget APIs require Bearer token
4. **Refresh**: Auto-refreshes 2 minutes before expiration

## Environment Configuration

### Critical Environment Variables

```bash
# AI Configuration
OPENAI_API_KEY=                    # Must match between environments
AI_FILTER_MODEL=gpt-4o-mini       # Model for product filtering
ENABLE_AI_PRODUCT_FILTERING=true  # Toggle AI filtering

# Database
SUPABASE_SERVICE_ROLE_KEY=        # For server-side operations
NEXT_PUBLIC_SUPABASE_URL=         # Public database URL

# Widget Security
WIDGET_JWT_SECRET=                # For widget authentication

# Product Behavior
PRODUCT_CONFIDENCE_THRESHOLD=0.3   # Clarification trigger threshold
ENABLE_INTENT_DETECTION=true      # Skip products for certain queries
```

### Environment Differences

- **localhost**: Uses `NEXT_PUBLIC_API_URL=http://localhost:3000`
- **production**: Uses `offerbase.co` domain
- **Common Issue**: Environment variables not synced between local and production

## Development Workflow

### When Adding AI Features

1. Update `/lib/instructions.ts` for behavior changes
2. Test locally first, then production (behaviors may differ)
3. Check training material context doesn't overwhelm instructions
4. Monitor performance impact on chat rendering

### When Modifying Product Matching

1. Test with `/test-ai-filtering.js` and `/test-aliases.js`
2. Update database functions in `database/migrations/`
3. Consider impact on vector search performance
4. Verify widget authentication still works

## Debugging Playbook (Low-Risk, High-Signal)

When debugging, prefer observation and small, reversible steps over large refactors.

1. Reproduce & Scope

   - Confirm a **minimal, deterministic repro** (URL, inputs, steps, expected vs actual).
   - Capture environment (local/prod), siteId, and relevant feature flags.
   - If repro is flaky, add lightweight telemetry before changing code.

2. Baseline First (No Code Changes)

   - Check recent diffs for the affected area (`git log -p -- <paths>`).
   - Inspect runtime errors/warnings (Next.js overlay, server logs).
   - Run:
     ```bash
     npm run lint
     npm run build  # catch type/SSR/hydration issues early
     ```
   - Use the React Profiler (if perf issue) and verify render counts before touching code.

3. Add Temporary Diagnostics (Bounded & Tagged)

   - Prefer **targeted logs/guards** over refactors. Tag all with `DEBUG:` and a cleanup note.
   - Example:
     ```ts
     // DEBUG: Remove after ticket OB-1234 is resolved.
     console.debug("[OB-1234] matchProducts input", {
       siteId,
       intent,
       count: products.length,
     });
     ```
   - For client issues, add non-invasive boundary checks or `ErrorBoundary` around the suspicious subtree.

4. Form a Hypothesis → Prove/Disprove Fast

   - Make **one change at a time**. Validate locally, then with a staging-like config.
   - If an optimization is proposed, first **measure** (before/after timings, render counts).

5. Guardrails During Fix

   - **No large file renames/restructures** during debugging.
   - **Do not** introduce new dependencies to “try things” without approval.
   - If a fix might be risky, gate it behind a **temporary feature flag** and default it **off**.

6. Verification Checklist (Before Commit)
   - Lint, typecheck, build pass.
   - No leftover `DEBUG:` logs or temporary flags enabled by default.
   - UX unaffected outside the target scope; widget auth still OK.
   - Add/adjust **a minimal test or script** if possible (e.g., extend `test-ai-filtering.js`).

This system balances AI intelligence with performance while maintaining security for embeddable widgets across customer websites.
