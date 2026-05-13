// "Your account has been deleted" confirmation email. Sent right
// before `auth.admin.deleteUser` in /api/account DELETE. The user has
// already explicitly confirmed deletion in the UI; this email is the
// receipt + a clarifying note that paid order records are retained
// (anonymized) for tax / Stripe reconciliation.

export interface AccountDeletedArgs {
  // Optional: included if available so the user can verify which
  // account they deleted (helpful for anyone with multiple accounts).
  email?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function accountDeleted(args: AccountDeletedArgs = {}): RenderedEmail {
  const safeEmail = args.email ? escapeHtml(args.email) : null;

  const subject = "Your StoryInk account has been deleted";

  const emailLineHtml = safeEmail
    ? `<p style="margin:0 0 14px 0;">
          Account: <span style="font-family:'SF Mono',Menlo,Consolas,monospace;color:#1a1814;">${safeEmail}</span>
        </p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f2ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#3a342c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f2ea;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fffaf2;border:1px solid #e6dfd1;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 16px 32px;">
                <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#4a6b3a;font-weight:500;">StoryInk</p>
                <h1 style="margin:8px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:#1a1814;line-height:1.3;">
                  Your account has been deleted.
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;font-size:15px;line-height:1.55;color:#3a342c;">
                ${emailLineHtml}
                <p style="margin:0 0 14px 0;">
                  Your stories, pets, and personal profile have all been
                  removed from our systems.
                </p>
                <p style="margin:0 0 14px 0;">
                  Any past hardcover orders that already cleared payment
                  are retained for tax and Stripe reconciliation
                  requirements, but the shipping address and other
                  personal details on those orders have been scrubbed.
                </p>
                <p style="margin:0;">
                  If this wasn't you, please reply to this email right
                  away.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:11px;color:#7a7060;">
            StoryInk &middot; we're sorry to see you go.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Your StoryInk account has been deleted.`,
    ``,
    args.email ? `Account: ${args.email}\n` : ``,
    `Your stories, pets, and personal profile have all been removed`,
    `from our systems.`,
    ``,
    `Any past hardcover orders that already cleared payment are`,
    `retained for tax and Stripe reconciliation requirements, but the`,
    `shipping address and other personal details on those orders have`,
    `been scrubbed.`,
    ``,
    `If this wasn't you, please reply to this email right away.`,
    ``,
    `— StoryInk`,
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
