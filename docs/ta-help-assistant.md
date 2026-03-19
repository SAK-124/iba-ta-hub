# TA Help Assistant

This project now includes a small TA-facing help chatbot inside the TA portal.

## Chosen OpenRouter Model

Recommended default model:

- `liquid/lfm-2.5-1.2b-instruct:free`

Why this model was chosen:

- completely free in the current OpenRouter free catalog
- still fast enough for short instructional answers in the TA portal
- stable with the current Auxilium prompting and workflow prep setup

Fallback model:

- `liquid/lfm-2.5-1.2b-instruct:free`

If `VITE_OPENROUTER_MODEL` is set to another free model, Auxilium still falls back to Liquid when the configured model request fails.

## What the Assistant Does

The chatbot is designed for:

- explaining how to use TA portal features
- guiding TAs through Zoom Processor
- explaining how to mark attendance
- explaining ticket handling, groups, late days, sessions, roster updates, and settings
- suggesting the right module for a task

It is intentionally grounded to current portal behavior and should not invent features outside the existing implementation.

## Source of Truth

The assistant should use:

- `docs/ta-portal-features-guide.md`

That guide now also covers:

- the `Groups` workspace with its left-side group directory and right-side roster assignment list
- the `Create Group` modal opened from the `+` button
- clickable group metrics that filter the roster list
- TA actions for enabling group editing, setting edit deadlines, recalculating shared late-day balances, and deleting all groups
- the current group late-day model, where original claim rows stay personal but grouped students share one effective pool of `3` late days

When Auxilium explains the groups workflow, it should describe the live UI exactly as it exists now:

- search groups from the left column
- use the right-side roster search plus metric filters for individual assignment work
- assign groups only from the per-student row input
- use `+` to build a new group from grouped and unassigned students
- treat `Delete All Groups` as destructive for group structure and derived sync state, but not for original personal late-day claim records or TA manual grants

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
