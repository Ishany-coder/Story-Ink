"use client";

import { resetCookieConsent } from "./CookieConsent";

// Footer-link button that clears the stored cookie consent and
// reloads, so the banner reappears. Implemented as a button styled
// to look like a link to keep the footer's tab order tidy.

export default function CookieSettingsLink() {
  return (
    <button
      type="button"
      onClick={resetCookieConsent}
      className="text-xs text-ink-500 hover:text-moss-700"
    >
      Cookie settings
    </button>
  );
}
