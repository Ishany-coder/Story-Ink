// "Your book shipped" email. Sent from the admin orders status
// transition route when an order moves into the `shipped` state.
//
// We intentionally don't include a tracking number here — it would be
// fabricated until the admin wires in a real carrier integration. The
// template is structured so an optional `trackingUrl` / `carrier` can
// be threaded through later without breaking call sites.

export interface OrderShippedArgs {
  storyTitle: string;
  orderId: string;
  // Optional carrier name (e.g. "USPS"). Omit until the admin has
  // somewhere real to look it up.
  carrier?: string | null;
  // Optional tracking URL. Same — omit unless real.
  trackingUrl?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function orderShipped(args: OrderShippedArgs): RenderedEmail {
  const { storyTitle, orderId, carrier, trackingUrl } = args;
  const safeTitle = escapeHtml(storyTitle);
  const shortOrderId = orderId.slice(0, 8);
  const safeCarrier = carrier ? escapeHtml(carrier) : null;

  const subject = `Your StoryInk book is on its way — ${storyTitle}`;

  const trackingHtml =
    trackingUrl && safeCarrier
      ? `<p style="margin:14px 0 0 0;">
            Tracking (${safeCarrier}):
            <a href="${escapeAttr(trackingUrl)}" style="color:#4a6b3a;text-decoration:underline;">
              ${escapeHtml(trackingUrl)}
            </a>
          </p>`
      : "";

  const trackingText =
    trackingUrl && carrier ? `\nTracking (${carrier}): ${trackingUrl}\n` : "";

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
                  Your book is on its way.
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;font-size:15px;line-height:1.55;color:#3a342c;">
                <p style="margin:0;">
                  <strong style="color:#1a1814;">${safeTitle}</strong>
                  has shipped. Please allow a few business days for it to
                  reach you.
                </p>
                ${trackingHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 16px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f2ea;border:1px solid #e6dfd1;border-radius:12px;">
                  <tr>
                    <td style="padding:16px 18px;font-size:13px;line-height:1.7;color:#3a342c;">
                      <div><span style="color:#7a7060;">Order</span> &nbsp; <span style="font-family:'SF Mono',Menlo,Consolas,monospace;color:#1a1814;">${shortOrderId}</span></div>
                      <div><span style="color:#7a7060;">Storybook</span> &nbsp; <span style="color:#1a1814;">${safeTitle}</span></div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;font-size:13px;line-height:1.6;color:#7a7060;">
                <p style="margin:0;">
                  Reply to this email if anything looks off when it arrives.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:11px;color:#7a7060;">
            StoryInk &middot; thank you again.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Your StoryInk book is on its way.`,
    ``,
    `"${storyTitle}" has shipped. Please allow a few business days for`,
    `it to reach you.`,
    trackingText,
    `Order:     ${shortOrderId}`,
    `Storybook: ${storyTitle}`,
    ``,
    `Reply to this email if anything looks off when it arrives.`,
    ``,
    `— StoryInk`,
  ].join("\n");

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

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
