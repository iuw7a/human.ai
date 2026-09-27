# Human AI

**Human AI** ist eine eigenständige, minimalistische AI-Chat-Plattform: Landing-Page mit Sofort-Chat, Streaming-Antworten, Bildanalyse, Supabase-Auth, Chat-Verlauf, Memory, Plugins, Library — in Schwarz mit rotem Akzent.

Live-Flow: `/` → Nachricht schreiben → `/chat/[id]` → Antwort streamt → Verlauf wird gespeichert.

## Features

- **Sofort-Chat auf der Landing-Page** (`/`): Text + Bild-Upload mit Vorschau, Suggestion-Chips, Weiterleitung auf `/chat/[id]`
- **Streaming-Chat** (`/chat/[id]`): Token-Streaming, Markdown + Code-Blöcke, Thinking-Indikator, Copy-Button, Bildanhänge mit Vorschau
- **Sidebar**: New Chat (`Strg+K`, legt sofort einen DB-Record an), Chat-Suche, Gruppierung (Heute/Gestern/7/30 Tage), Rename/Delete inline, Realtime-Updates, einklappbar
- **Plugins** (`/plugins`) und **Library** (`/library`, echte Uploads + Zähler)
- **Memory** (`/memory`): Einträge werden **in den Chat-Kontext injiziert** (personalisierte Antworten), CRUD, strikt user-isoliert
- **Master-System-Prompt** (`src/lib/systemPrompt.ts`): Identität, Entwickler (Abdulrahman Alshouli, Abd al-Ilah), Verhalten, Safety — deduped Rules
- **Auth**: Login/Signup/Logout/Profile/Account (Name, Passwort, Account-Löschung) via Supabase
- **White-Label**: UI zeigt nur „Human AI" — keine Modell-/Provider-Namen
- **Design**: Schwarz + Rot-Akzent, Kimi-ähnliches helles/dunkles Layout, responsiv mit Mobile-Drawer

## Tech-Stack

| Bereich | Technologie |
|---|---|
| Framework | Next.js 14 (App Router), React 18, Tailwind CSS |
| Auth + DB + Storage | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) |
| AI | NVIDIA Integrate API (OpenAI-kompatibel), serverseitig |
| Markdown | react-markdown + remark-gfm |

## Voraussetzungen

- Node.js 18+
- Supabase-Projekt (URL + Keys)
- NVIDIA API Key ([build.nvidia.com](https://build.nvidia.com))

> Hinweis: Nur Modelle funktionieren, für die der NVIDIA-Account berechtigt ist. Mit dem aktuellen Key antworten `meta/llama-3.2-11b-vision-instruct` (~0,3 s, mit Vision) und `openai/gpt-oss-20b`. `moonshotai/kimi-k3` hängt ohne Entitlement (siehe Troubleshooting).

## Setup

```bash
npm install
cp .env.example .env.local   # Keys eintragen (siehe unten)
npm run dev                  # http://localhost:3000
```

### 1. Environment (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SECRET_KEY=...        # nur Server, nie NEXT_PUBLIC_
SUPABASE_JWKS_URL=...
NVIDIA_API_KEY=...             # nur Server, nie NEXT_PUBLIC_
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL_ID=moonshotai/kimi-k3
```

### 2. Datenbank (`supabase/schema.sql`)

Im Supabase **SQL Editor** ausführen (idempotent, mehrfach lauffähig). Erstellt:

- Tabellen: `profiles`, `chats`, `messages`, `memories`, `attachments`
- Privaten Storage-Bucket `attachments`
- **Row Level Security**: jeder User sieht nur eigene Rows
- **Realtime**-Publikation für `chats`/`messages` (Sidebar-Live-Updates)

### 3. Build

```bash
npm run build
npm start
```

## Projektstruktur

```
src/
  app/
    page.tsx                    # Landing + Chat-Einstieg
    chat/[chatId]/page.tsx      # Chat (kanonisch: /chat/[id])
    chat/[chatId]/[modelId]/    # Legacy → redirect auf /chat/[id]
    login|signup|logout|profile|account|memory|platform|terms|plugins|library
    api/chat/route.ts           # AI-Endpoint (SSE-Stream, System-Prompt + Memories)
    api/upload/route.ts         # Bild-Upload (validiert, max. 8 MB, privat)
    api/account/delete/route.ts # Account-Löschung (Admin)
  components/
    Sidebar.tsx                 # Workspace-Nav + Chats + dunkles User-Menü
    ChatView.tsx                # Streaming-Logik + Persistenz
    ChatInput.tsx               # Input-Card + Bildvorschau
    Landing.tsx / Logo.tsx / Markdown.tsx / AppShell.tsx / ...
  lib/
    models.ts                   # Model-Registry (Slug → Provider + Provider-Modell-ID)
    systemPrompt.ts             # Human AI Master System Prompt
    chatHistory.ts              # History-Loader (RLS, signierte Bild-URLs)
    providers/
      types.ts                  # AIProvider-Interface
      nvidia.ts                 # NVIDIA-Provider (OpenAI-kompatibel, Timeout 60 s)
      registry.ts               # Slug → Provider-Auflösung
    supabase/{client,server,middleware}.ts
supabase/schema.sql             # DB-Schema + RLS + Realtime
public/{logo.webp,chat-bg.png}  # Logo + Chat-Hintergrund
```

## Modell-System

Neues Modell = ein Eintrag in `src/lib/models.ts`:

```ts
"mein-modell": {
  id: "mein-modell",            // URL-Slug: /chat/<id> löst intern auf
  provider: "nvidia",
  name: "Human AI",             // Anzeige-Name (White-Label)
  providerModelId: "vendor/modell-id",  // echte Provider-ID (nie im UI)
  vision: true,
},
```

`DEFAULT_MODEL_ID` bestimmt den Standard. Eigene Provider implementieren `AIProvider` (`chat`/`stream`) und werden in `registry.ts` verdrahtet. **API-Keys existieren nur serverseitig** (`/api/chat`, `/api/upload`).

## Routen

| Route | Zugang |
|---|---|
| `/`, `/chat/[id]` | öffentlich (Speichern nur eingeloggt) |
| `/login`, `/signup`, `/logout`, `/terms`, `/platform/about` | öffentlich |
| `/profile`, `/account`, `/memory`, `/platform`, `/plugins`, `/library` | Login nötig |

## Sicherheit

- NVIDIA- + Supabase-Secret-Keys nur serverseitig (kein `NEXT_PUBLIC_`)
- RLS auf allen Tabellen, User-Isolation überall
- Uploads: Typ-Check (PNG/JPEG/WebP/GIF), 8 MB-Limit, max. 4 Bilder, privater Bucket + signierte URLs
- AI-Timeout (60 s) mit verständlicher Fehlermeldung statt ewigem Laden

## Troubleshooting

| Problem | Ursache / Fix |
|---|---|
| „AI provider timed out" | NVIDIA-Account hat keine Berechtigung für das Modell → Credits/Entitlement auf build.nvidia.com prüfen, ggf. `DEFAULT_MODEL_ID` wechseln |
| Sidebar: „database tables missing" | `supabase/schema.sql` noch nicht ausgeführt |
| Seite ohne CSS / 500 `Cannot find module` | Nie `npm run build` parallel zu `next dev` laufen lassen → Dev stoppen, `.next` löschen, neu starten |
| Alte Chats weg | Entstanden vor dem Schema-Run und wurden nie gespeichert |

## Lizenz / Hinweise

- Terms-Seite ist ein Platzhalter-Entwurf (keine Rechtsberatung).
- Keine erfundenen Statistiken, keine Marketingversprechen.
- Externe Artworks/Marken (z. B. Testbilder) liegen in der Verantwortung des Betreibers.
