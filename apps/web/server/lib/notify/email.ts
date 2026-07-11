import { Resend } from "resend";
import type { Property } from "../../../../../packages/shared/src/types/index.js";
import { formatDkk } from "../../../../../packages/shared/src/utils/price.js";

let client: Resend | null = null;

function getResendClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("Missing RESEND_API_KEY");
    client = new Resend(apiKey);
  }
  return client;
}

export async function sendAlertEmail(
  to: string,
  searchName: string,
  properties: Property[],
): Promise<void> {
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!from) throw new Error("Missing NOTIFY_FROM_EMAIL");
  const frontendUrl = process.env.FRONTEND_URL ?? "";

  const items = properties
    .map(
      (p) =>
        `<li><a href="${frontendUrl}/property/${p.id}">${p.address}</a> — ${formatDkk(p.price)}</li>`,
    )
    .join("");

  const html = `
    <p>New listings match your saved search "${searchName}":</p>
    <ul>${items}</ul>
  `;

  const { error } = await getResendClient().emails.send({
    from,
    to,
    subject: `${properties.length} new match${properties.length === 1 ? "" : "es"} for "${searchName}"`,
    html,
  });
  if (error) throw new Error(typeof error === "string" ? error : JSON.stringify(error));
}
