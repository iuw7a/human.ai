export type ChatRole = "user" | "assistant" | "system";

export interface ChatImage {
  /** data-URI (base64) or https URL */
  url: string;
  /** storage path in Supabase, if persisted */
  storagePath?: string;
  mimeType?: string;
}

export interface ChatMessageInput {
  role: ChatRole;
  content: string;
  images?: ChatImage[];
}

export interface StreamCallbacks {
  onToken?: (token: string) => void | Promise<void>;
}

export interface AIProvider {
  readonly key: string;
  chat(messages: ChatMessageInput[], opts?: { signal?: AbortSignal }): Promise<string>;
  stream(
    messages: ChatMessageInput[],
    opts?: { signal?: AbortSignal; onToken?: (token: string) => void }
  ): Promise<string>;
}
