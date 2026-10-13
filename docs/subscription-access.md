# Human AI — Subscription → Model Access Mapping

## Discovered AI providers & models (no invented entries)

Discovered by inspecting `src/lib/providers/*`, `src/lib/models.ts`,
`supabase/admin_schema.sql`, `supabase/groq_models.sql` and live code:

| Provider | Base URL | Env key | Models (providerModelId) | Capabilities |
|---|---|---|---|---|
| NVIDIA | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` | `meta/llama-3.2-11b-vision-instruct` (slug `human-ai`, default) | text + vision, streaming, 60s timeout |
| NVIDIA | same | same | `openai/gpt-oss-20b` (slug `gpt-oss-20b`) | text, streaming |
| NVIDIA | same | `NVIDIA_MODEL_ID` override | `moonshotai/kimi-k3` (slug `kimi-k3`, disabled by default — no entitlement on the account) | text + vision, streaming |
| Groq | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` | `openai/gpt-oss-120b` (slug `groq-120b`, via `supabase/groq_models.sql`) | text, streaming |
| Server TTS | — | none (keyless) | `/api/tts` per-language voice | audio only, not an LLM |

All LLM calls go through `src/lib/providers/registry.ts`
(`createProviderFor` / `streamChatWithToolsFor` / `chatWithToolsFor`).
Keys stay server-side; `/api/admin/providers` and `/api/admin/system`
report only `configured` / `reachable` / `detail`, never secrets.

## Product access levels → plans

`src/lib/subscriptions.ts` is the source of truth.
`plan_access_rules` (DB) overrides the defaults below.

| Plan | Access levels (default) |
|---|---|
| `free` | `light` |
| `plus` | `light`, `pro` |
| `pro` | `light`, `pro`, `high`, `extra` |

Model gating uses **both**:
- `admin_models.plan` = minimum plan (`free` < `plus` < `pro`)
- `admin_models.access_level` = capability tier (`light`/`pro`/`high`/`extra`)

Default seed mapping (`supabase/subscriptions_schema.sql`):

| Slug | Provider model | min plan | access | Allowed for |
|---|---|---|---|---|
| `human-ai` | `meta/llama-3.2-11b-vision-instruct` | `free` | `light` | free, plus, pro |
| `gpt-oss-20b` | `openai/gpt-oss-20b` | `free` | `light` | free, plus, pro |
| `groq-120b` | `openai/gpt-oss-120b` | `plus` | `pro` | plus, pro |
| `kimi-k3` | `moonshotai/kimi-k3` | `pro` | `high` | pro only (currently disabled — no NVIDIA entitlement) |
| *(none yet)* | — | — | `extra` | pro only (admin can assign) |

Admins change this in `/admin → Models` (per-model min plan + tier)
and `/admin → Providers` (plan → tier rules, connection status).

## Enforcement

- Every protected request resolves the subscription server-side
  (`getEffectiveSubscription`) and checks `canAccessModel` **before**
  any provider call: `/api/chat`, `/api/agent/step`,
  `/api/agent-desktop/step`, `/api/computer-use/classify`,
  `/api/bots/[slug]/chat`, `/api/humi-assistants` (create/update).
- `profiles.plan` is mirrored for fast checks but expiry/suspension
  revoke premium immediately (`subscription_expires_at`,
  `subscription_status=suspended|expired`).
- Frontend (`ModelSelector`, `PlanBadge`, `/api/models?allowed`) only
  reflects permissions; the backend re-verifies and returns
  `403 { error, upgrade: true }` with an upgrade message on denial.
- Fallback: only a **permitted** model (user-entitled, enabled) is ever
  suggested on dead-model errors; the API never claims premium output
  from a weaker model.
- `subscription_source` is stored explicitly
  (`payment` only with verified `provider_ref`, else `admin_grant`,
  `redeem_code`, `promotion`, `external_provider`) — never inferred.

## Migration

Run once in Supabase SQL editor, after `schema.sql` + `admin_schema.sql`:

1. `supabase/subscriptions_schema.sql`

It extends `profiles` + `subscription_events`, adds
`admin_models.access_level`, creates `plan_access_rules`,
backfills status (source stays `NULL` = unknown for old rows),
and installs trigger `protect_profile_subscription_columns`
so ordinary users cannot edit their own plan/role/status/subscription.
