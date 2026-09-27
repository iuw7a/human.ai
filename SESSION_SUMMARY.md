# Human AI — Session-Stand

Datum: 27.09.2026 · Repo: github.com/iuw7a/human.ai (Branch `main`) · Lokal: `C:\Projecte\ai` · Dev: http://localhost:3001/

## Was funktioniert

- Landing (`/`) mit Sofort-Chat → `/chat/[id]`, Bild-Upload mit Vorschau
- Streaming-Chat mit Master-System-Prompt (Identität, Entwickler, Safety)
- Supabase Auth (Login/Signup/Logout/Profile/Account), DB-Tabellen + RLS + Realtime angelegt
- Sidebar: New Chat (sofort DB-Record), Suche, Gruppen, Rename/Delete, Realtime, dunkles User-Menü
- Memory: CRUD + Injektion in den Chat-Kontext
- Plugins/Library-Seiten, White-Label (nur „Human AI"), Dark-Design mit rotem Punktraster-BG
- GitHub-Push eingerichtet (`origin` → `iuw7a/human.ai`)

## Aktiver Provider

- NVIDIA-Key (serverseitig, `.env.local`, nie committen)
- Default-Modell-Slug `human-ai` → `meta/llama-3.2-11b-vision-instruct` (~0,3 s, Vision OK)
- `moonshotai/kimi-k3` hängt (kein Entitlement auf dem NVIDIA-Account) — bleibt konfiguriert

## Offen / To-dos

- NVIDIA-Entitlement für Kimi prüfen (build.nvidia.com: Credits, Modell-Zugriff)
- E2E-Retest der Chat-Persistenz nach Schema-Run (User-Test ausstehend)
- Alte Chats von vor dem Schema-Run sind verloren (nie gespeichert worden)
- `npm run build` nie parallel zu `next dev` laufen lassen (zerschießt `.next`)

## Wichtige Dateien

- `src/lib/systemPrompt.ts` — Master-Prompt · `src/lib/models.ts` — Model-Registry
- `src/app/api/chat/route.ts` — Streaming + Memory-Injektion · `supabase/schema.sql` — DB
