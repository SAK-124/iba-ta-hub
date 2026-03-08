# TA Help Assistant

This project now includes a small TA-facing help chatbot inside the TA portal.

## Chosen OpenRouter Model

Recommended default model:

- `liquid/lfm-2.5-1.2b-instruct:free`

Why this model was chosen:

- completely free in the current OpenRouter free catalog
- lighter than the larger free 3B, 12B, 24B, and 70B models
- fast enough for short instructional answers
- well-suited to concise "how do I use this feature?" guidance

## What the Assistant Does

The chatbot is designed for:

- explaining how to use TA portal features
- guiding TAs through Zoom Processor
- explaining how to mark attendance
- explaining ticket handling, late days, sessions, roster updates, and settings
- suggesting the right module for a task

It is intentionally grounded to current portal behavior and should not invent features outside the existing implementation.

## Source of Truth

The assistant should use:

- `docs/ta-portal-features-guide.md`

The frontend help layer retrieves the most relevant guide sections and injects them into the model request. This is intentional, so the markdown guide stays the single maintainable knowledge source for both humans and the bot.

## Files Added

- `src/components/ta/TAHelpAssistant.tsx`
- `src/lib/ta-help-assistant.ts`

Updated integration points:

- `src/components/ta/TAPortal.tsx`
- `src/vite-env.d.ts`

## Environment Variables

To enable live answers, set:

```bash
VITE_OPENROUTER_API_KEY="your_openrouter_key"
```

Optional override:

```bash
VITE_OPENROUTER_MODEL="liquid/lfm-2.5-1.2b-instruct:free"
```

## Important Note

The current implementation calls OpenRouter directly from the browser. That is acceptable for local testing or an internal tool, but it exposes the API key to the frontend bundle/runtime.

For a public production deployment, move the OpenRouter call behind a server-side or edge proxy before exposing this feature broadly.
