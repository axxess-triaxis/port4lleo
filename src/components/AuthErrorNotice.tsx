"use client";

import { useSyncExternalStore } from "react";

/**
 * Supabase reports OAuth failures in the URL fragment (#error=...&error_description=...),
 * which never reaches the server, so the callback can only see "no code". Read it here.
 * Rendered as plain text and length-capped, since anyone can craft this URL.
 */
function readHashError(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const desc = params.get("error_description") ?? params.get("error");
  return desc ? desc.replace(/\+/g, " ").slice(0, 200) : null;
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

export function AuthErrorNotice({ fallback }: { fallback?: string }) {
  const hashError = useSyncExternalStore(subscribe, readHashError, () => null);
  const message = hashError ? `Sign-in failed: ${hashError}` : fallback;
  if (!message) return null;
  return (
    <p role="alert" className="mb-8 rounded-lg border border-line bg-surface px-4 py-3 text-sm" data-testid="auth-error">
      {message}
    </p>
  );
}
