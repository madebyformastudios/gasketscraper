# Stack & coding rules

This project uses my standard stack. Follow these conventions throughout:

- **Next.js App Router** with **TypeScript in strict mode**.
- Default to **Server Components**. Add `'use client'` only to components that genuinely need interactivity (inputs, local state, clipboard access).
- **Styling:** Tailwind CSS utility classes plus **shadcn/ui** primitives (`Button`, `Input`, `Select`, `Card`, `Badge`). Do not hand-roll components that shadcn already provides.
- **Secrets** (API keys) live in `.env.local` and are read **only in server code** (route handlers / server components). Never import or reference them in client components.
- **API logic** goes in route handlers under `app/api/`. Keep fetch/transform logic in small, single-purpose helper functions in `lib/`, not inline in the handler.
- **Shared types** live in `lib/types.ts`. Type everything; avoid `any`.
- Prefer **named exports** and small, focused components and functions.
- **Handle errors explicitly:** try/catch around external calls, return meaningful HTTP status codes, surface a typed error to the UI.
- No leftover `console.log`, no dead code, no commented-out blocks in the final result.
- Assume **Prettier defaults** for formatting.
