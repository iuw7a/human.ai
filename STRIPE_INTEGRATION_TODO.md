# Stripe Integration TODO

Hosted **Stripe Checkout** selling the four Human AI (**Humi**) plans as recurring
subscriptions, fulfilled by a signature-verified webhook that updates
`profiles.plan` + `subscription_*`.

Plan tiers, cheapest → priciest:
**Humi Elite < Humi Pro < Humi Extra < Humi Enterprises**

Scenario: **B** — no existing Checkout Session call was found, so a minimal
integration was added. This file is the single source of truth for the remaining
setup steps.

> **Live blocker (17 Oct 2026):** the live Stripe account is **not activated yet** —
> `charges_enabled: false`, `payouts_enabled: false`, and every capability (incl.
> `card_payments`) is `inactive`. Until Stripe approves the account, live Checkout
> returns *"No valid payment method types for this Checkout Session"* and cards stay
> **"Action required"**. Fix it under **Verifizieren Sie Ihr Konto** in the Dashboard.
> To run the flow *now*, use a **test** key (`sk_test_…`) — the four live Price IDs
> below are already created and start working the moment the account is activated.

---

## Values to Replace

The following values are placeholders and must be updated before going live.

**Files containing placeholders:**
- [src/lib/stripe.ts](src/lib/stripe.ts)
- [src/app/api/stripe/create-checkout-session/route.ts](src/app/api/stripe/create-checkout-session/route.ts)
- [.env.example](.env.example)

| Field | Current Value | What to Set |
|-------|--------------|-------------|
| `STRIPE_PRICE_HUMI_ELITE` (env) | _empty_ | Stripe Price ID for **Humi Elite** (recurring) — <https://dashboard.stripe.com/prices>. |
| `STRIPE_PRICE_HUMI_PRO` (env) | _empty_ | Stripe Price ID for **Humi Pro** (recurring). |
| `STRIPE_PRICE_HUMI_EXTRA` (env) | _empty_ | Stripe Price ID for **Humi Extra** (recurring). |
| `STRIPE_PRICE_HUMI_ENTERPRISES` (env) | _empty_ | Stripe Price ID for **Humi Enterprises** (recurring). |
| `STRIPE_SECRET_KEY` (env) | _empty_ | Your Stripe secret key (`sk_test_…` / `sk_live_…`). |
| `STRIPE_WEBHOOK_SECRET` (env) | _empty_ | Signing secret (`whsec_…`) of the webhook endpoint you create (step 3). |
| `DOMAIN` (env) | `http://localhost:3000` | Your production base URL, e.g. `https://www.usehuman.de`. |

**No prices are displayed in the UI** — each card shows a **Coming soon** button
until its `STRIPE_PRICE_*` is set, and the exact amount is always shown by Stripe
at checkout.

---

## Configured Parameters

These parameters were configured in Checkout Studio and are already set correctly.

**Files containing these parameters:**
- [src/app/api/stripe/create-checkout-session/route.ts](src/app/api/stripe/create-checkout-session/route.ts)

| Parameter | Value |
|-----------|-------|
| `ui_mode` | `hosted_page` |
| `mode` | `subscription` (plans are recurring) |
| `billing_address_collection` | `auto` |
| `phone_number_collection` | `{ enabled: false }` |
| `automatic_tax` | `{ enabled: false }` |
| `allow_promotion_codes` | `true` |
| `payment_method_collection` | `always` (sent because `mode === "subscription"`) |
| `submit_type` | `auto` |
| `integration_identifier` | `hosted_web_0001` |
| `origin_context` | `web` |
| `line_items` | `[{ price: STRIPE_PRICE_<PLAN>, quantity: 1 }]` (from env) |
| `success_url` | `{DOMAIN}/checkout/success?session_id={CHECKOUT_SESSION_ID}` |
| `cancel_url` | `{DOMAIN}/checkout/cancel` |
| `client_reference_id` / `metadata.user_id` / `subscription_data.metadata.user_id` | The logged-in Human AI user id (used by the webhook) |
| `metadata.plan` | The purchased plan key (`humi_elite` …) |

**SDK version note:** the installed `stripe` SDK is **23.0.0**, so `ui_mode` is
`hosted_page` (SDK ≥ 21.0.0). If you downgrade below 21.0.0, change it to `hosted`.

---

## Setup and next steps

### 1. Database (required once)

Run [supabase/humi_plans.sql](supabase/humi_plans.sql) in the Supabase SQL editor.
It widens the `plan` check constraints and seeds the default access levels for the
four Humi tiers. Legacy `plus`/`pro` stay valid.

Verify:

```sql
select plan, access_levels from public.plan_access_rules order by plan;
```

### 2. Environment variables

Set these in `.env.local` **and** in your Vercel project (Production + Preview).
They are **server-only** — never prefix them with `NEXT_PUBLIC_`.

| Variable | Required | Where to get it |
|----------|----------|-----------------|
| `STRIPE_SECRET_KEY` | Yes | <https://dashboard.stripe.com/test/apikeys> |
| `STRIPE_PRICE_HUMI_ELITE` | Yes | <https://dashboard.stripe.com/prices> (recurring) |
| `STRIPE_PRICE_HUMI_PRO` | Yes | <https://dashboard.stripe.com/prices> (recurring) |
| `STRIPE_PRICE_HUMI_EXTRA` | Yes | <https://dashboard.stripe.com/prices> (recurring) |
| `STRIPE_PRICE_HUMI_ENTERPRISES` | Yes | <https://dashboard.stripe.com/prices> (recurring) |
| `DOMAIN` | Yes | Your production base URL |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook endpoint signing secret (step 3) |

### 3. Webhook endpoint

Create a webhook in the Dashboard → <https://dashboard.stripe.com/workbench/webhooks>
pointing to `{DOMAIN}/api/stripe/webhook`, subscribed to:

- `checkout.session.completed` — grants the purchased plan
- `customer.subscription.updated` — keeps plan/expiry in sync
- `customer.subscription.deleted` — downgrades to free

Then copy the signing secret into `STRIPE_WEBHOOK_SECRET`. (The route is
whitelisted in `src/lib/supabase/middleware.ts` so maintenance mode never blocks
Stripe deliveries.)

### 4. Dependency

- `stripe` (`^23.0.0`) added to `package.json`. No API version is pinned.

### 5. Files

| File | Purpose |
|------|---------|
| [src/lib/plan-labels.ts](src/lib/plan-labels.ts) | Client-safe plan catalog (keys, labels, ranks) |
| [src/lib/subscriptions.ts](src/lib/subscriptions.ts) | Entitlements / effective subscription (server) |
| [src/lib/stripe.ts](src/lib/stripe.ts) | Server-only Stripe client + plan/price helpers |
| [src/app/pricing/page.tsx](src/app/pricing/page.tsx) | Public pricing page (4 Humi tiers) |
| [src/app/api/stripe/create-checkout-session/route.ts](src/app/api/stripe/create-checkout-session/route.ts) | Creates the Checkout Session (POST) and redirects |
| [src/app/api/stripe/webhook/route.ts](src/app/api/stripe/webhook/route.ts) | Fulfilment webhook (updates `profiles` + `subscription_events`) |
| [src/app/checkout/success/page.tsx](src/app/checkout/success/page.tsx) | Post-payment success page |
| [src/app/checkout/cancel/page.tsx](src/app/checkout/cancel/page.tsx) | Cancel/return page |
| [src/components/AccountActions.tsx](src/components/AccountActions.tsx) | Upgrade buttons |
| [src/components/admin/UserActions.tsx](src/components/admin/UserActions.tsx) | Admin plan dropdown (all plans) |
| [supabase/humi_plans.sql](supabase/humi_plans.sql) | DB migration for the new plans |

### 6. How it works

1. `/pricing` lists the four tiers (public). Not signed in → "Sign in to subscribe".
2. A card posts a plain HTML form to `POST /api/stripe/create-checkout-session`
   with `plan=humi_elite|humi_pro|humi_extra|humi_enterprises`.
3. The route builds the session (user id in metadata) and responds `303` to Stripe.
4. After payment, Stripe redirects to `/checkout/success`.
5. Stripe calls `/api/stripe/webhook`; `checkout.session.completed` sets the user's
   `plan`, `subscription_status='active'`, `subscription_source='payment'`,
   `subscription_provider_ref=<Stripe subscription id>`, and records a
   `subscription_events` row.
6. Renewals/cancellations arrive via `customer.subscription.updated/deleted`.

### 7. Testing

Test mode + card `4242 4242 4242 4242` (any future expiry, any CVC, any postal
code). Others: `4000 0025 0000 3155` (3-D Secure), `4000 0000 0000 9995` (declined).
Local webhooks: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

### 8. Next steps

- Create the four recurring Prices and set the env vars.
- Tune per-tier AI access in `/admin` → plan rules (`plan_access_rules`).
- The free tier and legacy `plus`/`pro` are untouched so existing users keep working.
- Persist `customer_id` too if you later add the Customer Portal / invoices
  (`subscription_provider_ref` currently stores the Stripe **subscription** id).

### 9. Resources

- Stripe support: <https://support.stripe.com>
- Stripe docs MCP: <https://docs.stripe.com/mcp>
