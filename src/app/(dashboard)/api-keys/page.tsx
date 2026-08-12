"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "@/lib/dashboard/workspace-context";
import {
  buttonPrimaryClassName,
  formatKeyDate,
  type ApiKeyMeta,
} from "@/lib/dashboard/types";

export default function ApiKeysPage() {
  const { apiKeys, setApiKeys, setError, setNotice } = useWorkspace();
  const [creatingKey, setCreatingKey] = useState(false);
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  async function createApiKey() {
    setCreatingKey(true);
    setError("");
    setNotice("");
    setRevealedApiKey(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        apiKey?: string;
        apiKeyMeta?: ApiKeyMeta;
      };
      if (!res.ok || !data.ok || !data.apiKey || !data.apiKeyMeta) {
        throw new Error(data.error ?? "Failed to create API key");
      }
      setRevealedApiKey(data.apiKey);
      setApiKeys((current) => [data.apiKeyMeta!, ...current]);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create API key",
      );
    } finally {
      setCreatingKey(false);
    }
  }

  async function revokeApiKey(keyId: string) {
    setRevokingKeyId(keyId);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/api-keys/${encodeURIComponent(keyId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to revoke API key");
      }
      setApiKeys((current) => current.filter((key) => key.id !== keyId));
      if (revealedApiKey) setRevealedApiKey(null);
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Failed to revoke API key",
      );
    } finally {
      setRevokingKeyId(null);
    }
  }

  async function copyApiKey() {
    if (!revealedApiKey) return;
    try {
      await navigator.clipboard.writeText(revealedApiKey);
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">API keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a key into AgentBlit when connecting the Appointment tool.
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Keys</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Create and revoke connector API keys.
            </p>
          </div>
          <button
            type="button"
            className={buttonPrimaryClassName + " h-9 shrink-0 px-3 text-xs"}
            disabled={creatingKey}
            onClick={() => void createApiKey()}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {creatingKey ? "Creating…" : "Create key"}
          </button>
        </div>

        <div className="px-5 py-4">
          {revealedApiKey ? (
            <div className="mb-4 rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-xs font-medium text-foreground">
                Copy this key now — it will not be shown again.
              </p>
              <div className="mt-2 flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-card px-3 py-2 font-mono text-xs text-foreground">
                  {revealedApiKey}
                </code>
                <button
                  type="button"
                  onClick={() => void copyApiKey()}
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
                >
                  {copiedKey ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedKey ? "Copied" : "Copy"}
                </button>
              </div>
              <button
                type="button"
                className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setRevealedApiKey(null)}
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {apiKeys.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground">
                No API keys yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a key to connect this schedule to an AgentBlit agent.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {apiKeys.map((key) => (
                <li
                  key={key.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {key.label?.trim() || "API key"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Created {formatKeyDate(key.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    disabled={revokingKeyId === key.id}
                    aria-label="Revoke API key"
                    onClick={() => void revokeApiKey(key.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
