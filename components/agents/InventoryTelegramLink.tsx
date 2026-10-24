"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function InventoryTelegramLink({ slug }: { slug: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(method: "POST" | "DELETE") {
    setBusy(true); setCode(null); setMessage("");
    try {
      const result = await fetch(`/api/ops/telegram/${encodeURIComponent(slug)}`, { method, credentials: "same-origin", cache: "no-store" });
      const value = await result.json();
      if (!result.ok) { setMessage(typeof value.error === "string" ? value.error : "Account linking failed. Try again."); return; }
      if (method === "POST") { setCode(value.code); setMessage("Send this command privately to the Inventory bot within five minutes. It can be used once."); }
      else setMessage("Your Telegram links and unused codes for this space were revoked.");
    } catch { setMessage("Account linking could not complete. Try again."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-md border border-line bg-panel p-5 space-y-3" aria-label="Inventory Telegram account">
    <h2 className="font-semibold text-ink">Inventory on Telegram</h2>
    <p className="text-sm text-ink-secondary">Link your current space account to the separate Inventory bot. An operator must configure and start that bot first. Your current role and the integration review gate still apply.</p>
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" disabled={busy} onClick={() => submit("POST")}>Create private link code</Button>
      <Button variant="dangerOutline" disabled={busy} onClick={() => submit("DELETE")}>Revoke Telegram access</Button>
    </div>
    <p className="text-sm text-ink-secondary" role="status">{message}</p>
    {code && <code className="block break-all rounded-md border border-line bg-canvas p-3 text-sm text-ink">/link {code}</code>}
  </section>;
}
