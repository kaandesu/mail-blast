# Tenkai email blast

One-off cold-outreach blast via Resend to GitHub stargazers of **postgresql** and **n8n**.
Pitch: *we self-host it for you on a VPS, free, no credit card, an agent does the deploy.*

Each audience has **3 template variants** (different voice + layout), sent **round-robin**
across the recipient list. Neo-brutalist Tenkai look, matches `internal/email/templates/mvp_deployed.html`.

## Setup

```bash
cd scripts/email-blast
npm install
```

Uses `RESEND_API_KEY` from the repo-root `.env` (the same key the Go API uses).
You can override anything via a local `.env` in this folder.

## The one thing you change

`users.txt` holds **one audience at a time** (one email per row). Pick the audience with `AUDIENCE`:

```bash
AUDIENCE=postgresql npm run blast     # mail the Postgres list
AUDIENCE=n8n        npm run blast     # mail the n8n list
```

Swap `users.txt` + flip `AUDIENCE` to do the other batch.

## Flags

| env | default | what |
|-----|---------|------|
| `AUDIENCE` | — | `postgresql` or `n8n` (required) |
| `DRY_RUN` | `0` | `1` = print the variant→recipient mapping, send nothing |
| `EMAIL_OVERRIDE` | — | send **every** email to this address (preview all 3 variants in your inbox) |
| `THROTTLE_MS` | `600` | delay between sends (stays under Resend's rate limit) |

## Recommended flow

```bash
# 1. preview the plan, no sends
AUDIENCE=postgresql DRY_RUN=1 npm run blast

# 2. send all variants to yourself to eyeball the design
AUDIENCE=postgresql EMAIL_OVERRIDE=kaanapp182@gmail.com npm run blast

# 3. real send
AUDIENCE=postgresql npm run blast
```

Every run writes `results.json` (sent / failed / per-recipient log) for auditing.

## Templates

`templates/<audience>-<1|2|3>.html`. Subjects live in the `SUBJECTS` map in `blast.ts`.

- **v1** — builder-to-builder, minimal (status bar + CTA)
- **v2** — pain-point, 3 feature bullets
- **v3** — short & punchy, terminal block
