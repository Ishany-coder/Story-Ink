// Server-side feature flags for navbar visibility on the *admin's*
// view. Each flag maps to an env var like SHOW_SHIP — set to "false"
// to hide that tab from the admin only. Regular users always see
// every non-admin-only tab regardless of how these flags are set.
// Default is visible.
//
// Read in server components only (relies on process.env). The result
// is a plain object that can be passed as a prop into client
// components.

export interface NavFlags {
  home: boolean;
  pets: boolean;
  read: boolean;
  studio: boolean;
  ship: boolean;
  myOrders: boolean;
  orders: boolean;
  stats: boolean;
  support: boolean;
  help: boolean;
}

function flag(name: string, defaultValue = true): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === undefined || v === "") return defaultValue;
  // Treat the obvious "off" values as false; anything else (including
  // unset / empty / "true" / "1") leaves the tab visible.
  return !(v === "false" || v === "0" || v === "no" || v === "off");
}

export function readNavFlags(): NavFlags {
  return {
    home: flag("SHOW_HOME"),
    pets: flag("SHOW_PETS"),
    read: flag("SHOW_READ"),
    studio: flag("SHOW_STUDIO"),
    ship: flag("SHOW_SHIP"),
    myOrders: flag("SHOW_MY_ORDERS"),
    orders: flag("SHOW_ORDERS"),
    stats: flag("SHOW_STATS"),
    support: flag("SHOW_SUPPORT"),
    help: flag("SHOW_HELP"),
  };
}
