// Shared brand chrome for transactional emails. Major email clients
// strip <style> blocks, so every visual choice has to live inline.
//
// The mark is hosted at `/logo-mark.png` on the marketing site (a
// 256px square trimmed transparent PNG). We reference it by absolute
// URL so the image resolves the same way in Gmail / Apple Mail /
// Outlook regardless of the user's preview pane base URL handling.
// Inlining as base64 trips spam heuristics in Gmail when the data
// URL is more than a few KB; an external URL is the standard pattern.

function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "https://storyink.ai").replace(
    /\/$/,
    ""
  );
}

// Block-level <img> for the brand mark, sized for the email header.
// `display:block` + `border:0` are needed to defeat Outlook's default
// underline + inline gap behavior on images.
export function emailBrandMark(): string {
  const base = siteBaseUrl();
  return `<img src="${base}/logo-mark.png" alt="StoryInk" width="44" height="44" style="display:block;margin:0 0 12px 0;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />`;
}
