"use client";

/**
 * Page-load–scoped cache for hot JSON endpoints (subscription, models).
 * Multiple components mount per navigation; without this each one fires
 * its own request. Entries live 60s, then refresh on next mount.
 */

interface CacheEntry {
  at: number;
  promise: Promise<unknown>;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.promise as Promise<T>;
  const promise = loader();
  cache.set(key, { at: now, promise });
  // Drop failures so the next caller retries instead of caching an error.
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

export interface SubscriptionInfo {
  plan: string;
  subscriptionStatus: string;
  source: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  accessLevels: string[];
}

export function getSubscription(): Promise<SubscriptionInfo | null> {
  return cached<SubscriptionInfo | null>("me:subscription", async () => {
    try {
      const r = await fetch("/api/me/subscription");
      if (!r.ok) return null;
      return (await r.json()) as SubscriptionInfo;
    } catch {
      return null;
    }
  });
}

export interface ModelInfo {
  id: string;
  name: string;
  vision: boolean;
  plan: string;
  access_level: string;
  allowed?: boolean;
}

export function getModels(): Promise<ModelInfo[]> {
  return cached<ModelInfo[]>("api:models", async () => {
    try {
      const r = await fetch("/api/models");
      if (!r.ok) return [];
      const j = await r.json();
      return (j.models ?? []) as ModelInfo[];
    } catch {
      return [];
    }
  });
}
