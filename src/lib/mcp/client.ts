export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface RpcResponse {
  jsonrpc?: string;
  id?: number | string;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

function parseSSE(text: string): RpcResponse[] {
  const out: RpcResponse[] = [];
  for (const chunk of text.split("\n\n")) {
    const line = chunk.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      out.push(JSON.parse(data) as RpcResponse);
    } catch {
      // ignore partial frames
    }
  }
  return out;
}

function pickById(events: RpcResponse[], id: number): RpcResponse | null {
  return events.find((e) => e.id === id) ?? null;
}

export interface McpCallOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  protocolVersion?: string;
}

/**
 * Minimal Streamable-HTTP MCP client (initialize → tools/list → tools/call).
 * Stateless: performs the handshake on every call batch. SERVER ONLY.
 */
export class McpClient {
  constructor(
    private url: string,
    private opts: McpCallOptions = {}
  ) {}

  private baseHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(this.opts.headers ?? {}),
      ...(extra ?? {}),
    };
  }

  private async post(body: unknown, sessionId?: string, timeoutMs?: number): Promise<{ msg: RpcResponse | null; sessionId: string; status: number }> {
    const headers = this.baseHeaders(sessionId ? { "mcp-session-id": sessionId } : undefined);
    const res = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs ?? this.opts.timeoutMs ?? 25000),
    });
    const ct = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    let msg: RpcResponse | null = null;
    if (ct.includes("text/event-stream")) {
      const id = (body as { id?: number }).id;
      msg = id !== undefined ? pickById(parseSSE(raw), id) : parseSSE(raw)[0] ?? null;
    } else {
      try {
        msg = JSON.parse(raw) as RpcResponse;
      } catch {
        msg = null;
      }
    }
    const sid =
      res.headers.get("mcp-session-id") ?? res.headers.get("mcp-session-id".toUpperCase()) ?? sessionId ?? "";
    return { msg, sessionId: sid, status: res.status };
  }

  private async handshake(): Promise<string> {
    const { msg, sessionId, status } = await this.post(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: this.opts.protocolVersion ?? "2025-06-18",
          capabilities: {},
          clientInfo: { name: "human-ai", version: "1.0" },
        },
      },
      undefined,
      20000
    );
    if (status === 401 || status === 403) {
      throw new Error(`MCP server requires authentication (HTTP ${status}).`);
    }
    if (!msg || msg.error || !msg.result) {
      throw new Error(
        `MCP initialize failed (HTTP ${status})${msg?.error?.message ? `: ${msg.error.message}` : ""}.`
      );
    }
    // Best effort: notify initialized (ignore failures).
    try {
      await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId, 8000);
    } catch {
      // ignore
    }
    return sessionId;
  }

  async listTools(): Promise<McpTool[]> {
    const sessionId = await this.handshake();
    const { msg, status } = await this.post(
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      sessionId
    );
    if (status === 401 || status === 403) {
      throw new Error(`MCP server requires authentication (HTTP ${status}).`);
    }
    if (!msg || msg.error) {
      throw new Error(`MCP tools/list failed${msg?.error?.message ? `: ${msg.error.message}` : ""}.`);
    }
    const tools = (msg.result?.["tools"] as Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>) ?? [];
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
    }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async callTool(name: string, args: Record<string, any>): Promise<string> {
    const sessionId = await this.handshake();
    const { msg, status } = await this.post(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } },
      sessionId,
      60000
    );
    if (status === 401 || status === 403) {
      throw new Error(`MCP server requires authentication (HTTP ${status}).`);
    }
    if (!msg || msg.error) {
      throw new Error(`MCP tool call failed${msg?.error?.message ? `: ${msg.error.message}` : ""}.`);
    }
    const content = msg.result?.["content"] as Array<{ type?: string; text?: string }> | undefined;
    if (Array.isArray(content)) {
      return content
        .map((c) => (typeof c.text === "string" ? c.text : JSON.stringify(c)))
        .join("\n")
        .slice(0, 8000);
    }
    return JSON.stringify(msg.result ?? {}).slice(0, 8000);
  }
}

/** Probe a user-supplied endpoint: returns tools if it speaks MCP, else throws. */
export async function probeEndpoint(url: string, headers?: Record<string, string>): Promise<McpTool[]> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http(s) endpoints are allowed.");
  }
  return new McpClient(url, { headers }).listTools();
}
