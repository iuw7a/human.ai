/**
 * Public documentation content for /docs.
 * Only what an end user may see: pages, models, API, FAQ.
 * No providers, no internal paths, no admin surfaces.
 */

export type DocItem = {
  path: string;
  href?: string;
  title: string;
  text: string;
  login?: boolean;
  badge?: string;
};

export type DocGroup = {
  id: string;
  title: string;
  hint: string;
  icon: "chat" | "tools" | "play" | "account" | "legal";
  items: DocItem[];
};

export const DOC_GROUPS: DocGroup[] = [
  {
    id: "chat",
    title: "Chat & Assistenten",
    hint: "Fragen stellen, Antworten streamen, Verlauf behalten",
    icon: "chat",
    items: [
      {
        path: "/",
        title: "Start & Sofort-Chat",
        text: "Nachricht schreiben oder ein Bild anhängen und direkt loslegen. Die Antwort erscheint Zeichen für Zeichen — ganz ohne Konto.",
      },
      {
        path: "/chat/new",
        title: "Neuer Chat",
        text: "Frischer Chat mit leerem Verlauf. Angemeldet wird alles automatisch gespeichert und du findest ihn später in der Seitenleiste wieder.",
      },
      {
        path: "/chat/[id]",
        href: "/chat/new",
        title: "Gespeicherter Chat",
        text: "Ein einzelner Chat mit vollem Verlauf — inklusive Bilder, Markdown und Code-Blöcken.",
      },
      {
        path: "/text2voice",
        title: "Text → Stimme",
        text: "Schreiben oder sprechen. Die Antwort kommt als Text zurück und wird zusätzlich vorgelesen.",
      },
    ],
  },
  {
    id: "tools",
    title: "Erstellen & Werkzeuge",
    hint: "Von der Idee zum Ergebnis",
    icon: "tools",
    items: [
      {
        path: "/build",
        title: "Website-Builder",
        text: "Beschreibe deine Website in Worten. Der Assistent plant, schreibt sie und startet eine Vorschau, die du sofort öffnen kannst.",
        login: true,
      },
      {
        path: "/agent",
        title: "Autonomer Agent",
        text: "Ein Assistent, der eine Aufgabe in mehreren Schritten selbst erledigt — und vor kritischen Schritten deine Freigabe einholt.",
        login: true,
      },
      {
        path: "/computer-use",
        title: "Computer-Steuerung",
        text: "Verbinde deinen Rechner und lass Aufgaben direkt auf dem Desktop ausführen.",
        login: true,
        badge: "Desktop",
      },
      {
        path: "/library",
        title: "Bibliothek",
        text: "Deine hochgeladenen Dateien und Bilder, gesammelt an einem Ort.",
        login: true,
      },
      {
        path: "/plugins",
        title: "Plugins",
        text: "Zusätzliche Fähigkeiten für deine Chats aktivieren.",
        login: true,
      },
      {
        path: "/memory",
        title: "Gedächtnis",
        text: "Dinge, die sich Human AI dauerhaft merken soll. Sie fließen automatisch in neue Antworten ein.",
        login: true,
      },
    ],
  },
  {
    id: "play",
    title: "Spiel & Integrationen",
    hint: "Ausprobieren und anbinden",
    icon: "play",
    items: [
      {
        path: "/chess",
        title: "Schach",
        text: "Spiele gegen die KI — mit Zugliste, Uhr und Ergebnis.",
      },
      {
        path: "/mcp",
        title: "Integrationen",
        text: "Externe Werkzeuge und Dienste verbinden.",
        login: true,
        badge: "Bald",
      },
    ],
  },
  {
    id: "account",
    title: "Konto & Pläne",
    hint: "Verwalten und erweitern",
    icon: "account",
    items: [
      {
        path: "/pricing",
        title: "Tarife",
        text: "Alle verfügbaren Pläne im Überblick. Die genauen Preise zeigt die sichere Checkout-Seite.",
      },
      {
        path: "/account",
        title: "Konto",
        text: "Aktueller Plan, Laufzeit und Wechsel.",
        login: true,
      },
      {
        path: "/profile",
        title: "Profil",
        text: "Name und Passwort ändern.",
        login: true,
      },
      {
        path: "/support",
        title: "Support",
        text: "Frage stellen und Antwort vom Team bekommen.",
        login: true,
      },
      {
        path: "/platform/dash",
        title: "Entwickler-Dashboard",
        text: "Nutzung, Limits, Abrechnung und Modelle im eigenen Bereich.",
        login: true,
      },
      {
        path: "/platform/dash/apikey",
        title: "API-Keys",
        text: "Key erstellen, Umfang wählen (Chat, Bilder oder beides) und jederzeit widerrufen.",
        login: true,
      },
    ],
  },
  {
    id: "legal",
    title: "Zugang & Rechtliches",
    hint: "Konto, Regeln, Anmeldung",
    icon: "legal",
    items: [
      { path: "/login", title: "Anmelden", text: "Mit E-Mail und Passwort einloggen." },
      { path: "/signup", title: "Registrieren", text: "Neues Konto anlegen." },
      {
        path: "/terms",
        title: "Nutzungsbedingungen",
        text: "Die Regeln für die Nutzung von Human AI.",
      },
    ],
  },
];

export const DOC_MODELS = [
  {
    id: "humi1.1-speed",
    title: "Text & Bilder verstehen",
    text: "Der Standard für alles: schnelle, präzise Antworten. Versteht auch Bilder, die du anhängst.",
  },
  {
    id: "humi.1-images",
    title: "Bilder erzeugen",
    text: "Erzeugt aus einer Beschreibung ein neues Bild.",
  },
];

export const DOC_ENDPOINTS = [
  {
    method: "GET" as const,
    path: "/api/models",
    text: "Alle verfügbaren Modelle mit Anzeigename, Bild-Unterstützung und Mindest-Plan. Ohne Anmeldung nutzbar.",
    example: `curl https://usehuman.de/api/models`,
  },
  {
    method: "POST" as const,
    path: "/api/chat",
    text: "Eine Chat-Antwort als Stream. Braucht einen API-Key im Header x-api-key und folgt den Limits deines Plans.",
    example: `curl https://usehuman.de/api/chat \\
  -H "x-api-key: DEIN_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "modelId": "humi1.1-speed",
    "messages": [
      { "role": "user", "content": "Hallo" }
    ]
  }'`,
  },
];

export const DOC_QUICKSTART = [
  {
    step: "1",
    title: "Chat starten",
    text: "Startseite öffnen, Frage schreiben, los. Kein Konto nötig.",
    href: "/",
    cta: "Zum Chat",
  },
  {
    step: "2",
    title: "Konto anlegen",
    text: "Für Verlauf, Bibliothek, Gedächtnis und Builder.",
    href: "/signup",
    cta: "Registrieren",
  },
  {
    step: "3",
    title: "API nutzen",
    text: "Key erstellen und mit x-api-key in deiner App anfragen.",
    href: "/platform/dash/apikey",
    cta: "API-Key holen",
  },
];

export const DOC_FAQ = [
  {
    q: "Brauche ich ein Konto?",
    a: "Nein, chatten geht sofort. Ein Konto brauchst du für gespeicherten Verlauf, Bibliothek, Gedächtnis, den Builder und die API.",
  },
  {
    q: "Welches Modell benutzt Human AI?",
    a: "Das passende wird automatisch gewählt — du musst nichts einstellen. Anhängen kannst du Bilder direkt im Chat.",
  },
  {
    q: "Was kostet Human AI?",
    a: "Die Tarif-Übersicht findest du unter Tarife. Der genaue Preis wird auf der sicheren Checkout-Seite angezeigt, bevor du zahlst.",
  },
  {
    q: "Kann ich Human AI in meiner eigenen App nutzen?",
    a: "Ja. Erstelle einen API-Key und rufe die öffentliche API mit dem Header x-api-key auf. Der Key wirkt wie du und folgt deinen Plan-Limits.",
  },
  {
    q: "Wer sieht meine Chats?",
    a: "Deine Inhalte sind deinem Konto zugeordnet und für andere Nutzer nicht einsehbar.",
  },
  {
    q: "Kann ich meinen Key wieder sperren?",
    a: "Ja, jederzeit unter API-Keys. Apps, die ihn benutzen, funktionieren danach sofort nicht mehr.",
  },
];
