/**
 * Single source of truth for brand tokens on the landing surface.
 *
 * Landing components were originally written with hardcoded hex values — fine
 * for a static marketing site, less ideal once we have multiple surfaces
 * (landing + admin) that need to stay in lockstep. New code should import
 * from here. If you want to refactor the existing components later, search
 * for the literal hex values and replace.
 *
 * Mirror of the mobile app's design tokens in `mobile/src/theme/tokens.ts`,
 * adapted for web (CSS hex, not RN style objects). Keep them in sync.
 */
export const brand = {
  // Foundational dark surface — same as mobile bg.base.
  bg: {
    base: "#0F0F11",
    surface: "#1A1A1E",
    elevated: "#242428",
  },
  ink: {
    primary: "#EEEEEF",
    secondary: "#A0A0AB",
    muted: "#6C6C74",
  },
  accent: {
    // Landing leans into red for the wordmark (Dunner = "calls",
    // urgency-tinted) while the mobile app uses green for recovery and cyan
    // for live-call states. Both palettes ship together.
    red: "#FF1A1A",
    recovery: "#10B981",
    neutral: "#22D3EE",
    failure: "#EF4444",
    warning: "#FBBF24",
  },
  border: {
    subtle: "#2A2A2F",
    default: "#3A3A3F",
  },
} as const;

export const LOGO_SRC = "/images/logo.png";
export const LOGO_INTRINSIC = { width: 432, height: 86 } as const;
