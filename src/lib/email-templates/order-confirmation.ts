// "Thanks for your order" email. Sent when the print_orders row
// reaches status='received' — i.e. the Stripe payment cleared and the
// interior + cover PDFs have been built. Manual fulfillment is queued
// from there.
//
// Inline styles only — most major email clients (Gmail's app, Outlook
// desktop) strip <style> blocks. The cream / moss palette mirrors the
// site's so the brand stays recognizable.

import { emailBrandMark } from "./_brand";

export interface OrderConfirmationArgs {
  storyTitle: string;
  orderId: string;
  pageCount: number;
  amountUsd: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function orderConfirmation(args: OrderConfirmationArgs): RenderedEmail {
  const { storyTitle, orderId, pageCount, amountUsd } = args;
  const safeTitle = escapeHtml(storyTitle);
  const amountStr = `$${amountUsd.toFixed(2)}`;
  const shortOrderId = orderId.slice(0, 8);

  const subject = `Your StoryInk order is confirmed — ${storyTitle}`;

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f2ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#3a342c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f2ea;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fffaf2;border:1px solid #e6dfd1;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 16px 32px;">
                ${emailBrandMark()}
                <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#4a6b3a;font-weight:500;">StoryInk</p>
                <h1 style="margin:8px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:#1a1814;line-height:1.3;">
                  Thank you — your order is confirmed.
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 16px 32px;font-size:15px;line-height:1.55;color:#3a342c;">
                <p style="margin:0 0 14px 0;">
                  We received your order for the hardcover keepsake of
                  <strong style="color:#1a1814;">${safeTitle}</strong>.
                </p>
                <p style="margin:0 0 14px 0;">
                  Each book is hand-finished and printed to museum-grade
                  spec, so production takes a few business days. You'll
                  get another email from us the moment it ships.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 16px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f2ea;border:1px solid #e6dfd1;border-radius:12px;">
                  <tr>
                    <td style="padding:16px 18px;font-size:13px;line-height:1.7;color:#3a342c;">
                      <div><span style="color:#7a7060;">Order</span> &nbsp; <span style="font-family:'SF Mono',Menlo,Consolas,monospace;color:#1a1814;">${shortOrderId}</span></div>
                      <div><span style="color:#7a7060;">Storybook</span> &nbsp; <span style="color:#1a1814;">${safeTitle}</span></div>
                      <div><span style="color:#7a7060;">Pages</span> &nbsp; <span style="color:#1a1814;">${pageCount}</span></div>
                      <div><span style="color:#7a7060;">Total</span> &nbsp; <span style="color:#1a1814;">${amountStr}</span></div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;font-size:13px;line-height:1.6;color:#7a7060;">
                <p style="margin:0;">
                  If anything looks off, just reply to this email and we'll
                  sort it out.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:11px;color:#7a7060;">
            StoryInk &middot; thanks for trusting us with your story.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Thank you — your StoryInk order is confirmed.`,
    ``,
    `We received your order for the hardcover keepsake of "${storyTitle}".`,
    ``,
    `Each book is hand-finished and printed to museum-grade spec, so`,
    `production takes a few business days. You'll get another email`,
    `from us the moment it ships.`,
    ``,
    `Order:     ${shortOrderId}`,
    `Storybook: ${storyTitle}`,
    `Pages:     ${pageCount}`,
    `Total:     ${amountStr}`,
    ``,
    `If anything looks off, just reply to this email and we'll sort it out.`,
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
