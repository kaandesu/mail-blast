/**
 * Tenkai cold-outreach email blast.
 *
 * One-off marketing send to GitHub stargazers of `postgresql` / `n8n`.
 * Pitch: we self-host it for you on a VPS, free, no credit card, an agent
 * does the deployment.
 *
 * Usage:
 *   AUDIENCE=postgresql DRY_RUN=1 npm run blast        # preview, no sends
 *   AUDIENCE=postgresql EMAIL_OVERRIDE=you@x.com npm run blast   # send all to you
 *   AUDIENCE=postgresql npm run blast                  # real send
 *   AUDIENCE=n8n npm run blast
 *
 * Flip AUDIENCE + swap users.txt to mail the other list.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Resend } from "resend";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Reuse the API's RESEND_API_KEY from the repo-root .env, with a local override.
dotenv.config({ path: resolve(__dirname, "../../.env") });
dotenv.config({ path: resolve(__dirname, ".env"), override: true });

// ---- config -------------------------------------------------------------
type Audience = "postgresql" | "n8n";

const AUDIENCE = (process.env.AUDIENCE || "").toLowerCase() as Audience;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const EMAIL_OVERRIDE = process.env.EMAIL_OVERRIDE?.trim() || "";
const THROTTLE_MS = Number(process.env.THROTTLE_MS || 600);

const FROM = "Tenkai <noreply@kampai.dev>";
// Replies + unsubscribe land in a real, monitored inbox (same one the Go
// email package redirects @kampai.dev mail to).
const REPLY_TO = "main@kampai.dev";
const VARIANTS = 3;

// Subject line per audience + variant (0-indexed). Voice matches the template.
const SUBJECTS: Record<Audience, string[]> = {
  postgresql: [
    "Free Postgres hosting — we do the VPS setup",
    "Stop paying for managed Postgres",
    "git push → live Postgres. free.",
  ],
  n8n: [
    "Free n8n hosting — we do the VPS setup",
    "Own your n8n workflows. Self-host them free.",
    "git push → self-hosted n8n. free.",
  ],
};

// ---- helpers ------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function loadRecipients(): string[] {
  const file = resolve(__dirname, "users.txt");
  if (!existsSync(file)) {
    console.error(`✗ users.txt not found at ${file}`);
    process.exit(1);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const email = line.split(/[,\s]/)[0].trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      console.warn(`  ⚠ skipping invalid email: ${line}`);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function loadTemplate(audience: Audience, variant: number): string {
  const file = resolve(
    __dirname,
    "templates",
    `${audience}-${variant + 1}.html`,
  );
  if (!existsSync(file)) {
    console.error(`✗ template not found: ${file}`);
    process.exit(1);
  }
  return readFileSync(file, "utf8");
}

// ---- main ---------------------------------------------------------------
async function main() {
  if (AUDIENCE !== "postgresql" && AUDIENCE !== "n8n") {
    console.error(
      `✗ Set AUDIENCE=postgresql or AUDIENCE=n8n (got "${process.env.AUDIENCE ?? ""}")`,
    );
    process.exit(1);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey && !DRY_RUN) {
    console.error("✗ RESEND_API_KEY not set (and not a DRY_RUN). Aborting.");
    process.exit(1);
  }

  const recipients = loadRecipients();
  if (recipients.length === 0) {
    console.error("✗ No valid recipients in users.txt.");
    process.exit(1);
  }

  // Preload the 3 templates once.
  const templates = Array.from({ length: VARIANTS }, (_, v) =>
    loadTemplate(AUDIENCE, v),
  );

  console.log("─".repeat(56));
  console.log(`  Tenkai blast · audience=${AUDIENCE}`);
  console.log(
    `  recipients=${recipients.length} · variants=${VARIANTS} · throttle=${THROTTLE_MS}ms`,
  );
  console.log(
    `  mode=${DRY_RUN ? "DRY_RUN (no sends)" : EMAIL_OVERRIDE ? `OVERRIDE → ${EMAIL_OVERRIDE}` : "LIVE"}`,
  );
  console.log("─".repeat(56));

  const resend = apiKey ? new Resend(apiKey) : null;
  const results: Array<{
    to: string;
    variant: number;
    subject: string;
    status: string;
    id?: string;
    error?: string;
  }> = [];
  let sent = 0,
    failed = 0;

  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i];
    const variant = i % VARIANTS;
    const subject = SUBJECTS[AUDIENCE][variant];
    const html = templates[variant];
    const dest = EMAIL_OVERRIDE || to;

    if (DRY_RUN) {
      console.log(`  [dry] ${to.padEnd(34)} v${variant + 1}  "${subject}"`);
      results.push({ to, variant: variant + 1, subject, status: "dry-run" });
      continue;
    }

    let lastErr = "";
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const { data, error } = await resend!.emails.send({
          from: FROM,
          to: dest,
          replyTo: REPLY_TO,
          subject,
          html,
        });
        if (error) throw new Error(`${error.name}: ${error.message}`);
        sent++;
        ok = true;
        console.log(`  ✓ ${to.padEnd(34)} v${variant + 1}  ${data?.id ?? ""}`);
        results.push({
          to,
          variant: variant + 1,
          subject,
          status: "sent",
          id: data?.id,
        });
      } catch (e: any) {
        lastErr = e?.message ?? String(e);
        if (attempt < 3) {
          await sleep(THROTTLE_MS * attempt * 2); // back off on rate-limit / 5xx
        }
      }
    }
    if (!ok) {
      failed++;
      console.error(`  ✗ ${to.padEnd(34)} v${variant + 1}  ${lastErr}`);
      results.push({
        to,
        variant: variant + 1,
        subject,
        status: "failed",
        error: lastErr,
      });
    }

    if (i < recipients.length - 1) await sleep(THROTTLE_MS);
  }

  const logPath = resolve(__dirname, "results.json");
  writeFileSync(
    logPath,
    JSON.stringify(
      {
        audience: AUDIENCE,
        at: new Date().toISOString(),
        sent,
        failed,
        results,
      },
      null,
      2,
    ),
  );

  console.log("─".repeat(56));
  console.log(`  done · sent=${sent} failed=${failed} · log → ${logPath}`);
  console.log("─".repeat(56));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
