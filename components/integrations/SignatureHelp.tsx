import { Card, CardHeader, DetailList } from "@/components/ui/display";

const SNIPPET = `import crypto from "node:crypto";

// rawBody: the request body exactly as received (a string, not parsed JSON).
function verify(secret, rawBody, header) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!parts.v1 || age > 300) return false;
  const expected = crypto.createHmac("sha256", secret)
    .update(\`\${parts.t}.\${rawBody}\`).digest("hex");
  return expected.length === parts.v1.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}`;

/** How receivers check that an event really came from this space. */
export function SignatureHelp() {
  return (
    <Card as="section" aria-labelledby="signatures-heading">
      <CardHeader title={<span id="signatures-heading">Verifying signatures</span>} description="Every event is a POST with a JSON body and these headers. Check the signature before trusting the body." />
      <DetailList
        items={[
          { label: "X-SpaceWorks-Signature", value: <><span className="code-text">t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</span>, where v1 is the HMAC-SHA256 of “t.raw body” using the signing secret.</> },
          { label: "X-SpaceWorks-Event", value: "The event type, such as loan.issued (test events say test)." },
          { label: "X-SpaceWorks-Delivery", value: "The delivery id. Retries keep the same id, so use it to ignore repeats." },
        ]}
      />
      <p className="mt-4 text-body-ui text-ink-secondary">Reject events whose timestamp is more than five minutes old. Answer with any 2xx status within ten seconds; anything else is retried with growing gaps, and a webhook that keeps failing is switched off.</p>
      <pre className="code-text mt-4 overflow-x-auto rounded-lg bg-inverse p-4 text-sm text-on-inverse"><code>{SNIPPET}</code></pre>
    </Card>
  );
}
