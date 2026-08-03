import { colors, spacing, radii } from './index.js';

/**
 * Tokens shaped for Tailwind/NativeWind config.
 * Use in apps/mobile/tailwind.config.js as `theme.extend = tailwindTheme`.
 */
export const tailwindTheme = {
  colors: {
    bg: colors.bg,
    'bg-muted': colors.bgMuted,
    surface: colors.surface,
    'surface-dark': colors.surfaceDark,
    gold: colors.gold,
    'gold-deep': colors.goldDeep,
    'gold-soft': colors.goldSoft,
    text: colors.text,
    'text-muted': colors.textMuted,
    'text-on-dark': colors.textOnDark,
    'text-on-dark-muted': colors.textOnDarkMuted,
    border: colors.border,
    'border-strong': colors.borderStrong,
    ink: colors.ink,
    'ink-raised': colors.inkRaised,
    'ink-soft': colors.inkSoft,
    'ink-border': colors.inkBorder,
    cream: colors.cream,
    'cream-deep': colors.creamDeep,
    'neutral-light': colors.neutralLight,
    'gold-bright': colors.goldBright,
    bronze: colors.bronze,
    charcoal: colors.charcoal,
    'charcoal-muted': colors.charcoalMuted,
    line: colors.line,
    'service-residential': colors.serviceResidential,
    'service-office': colors.serviceOffice,
    'service-hospital': colors.serviceHospital,
    'service-post-build': colors.servicePostBuild,
    'service-fumigation': colors.serviceFumigation,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  },
  spacing: Object.fromEntries(Object.entries(spacing).map(([k, v]) => [k, `${v}px`])),
  borderRadius: Object.fromEntries(Object.entries(radii).map(([k, v]) => [k, `${v}px`])),
};
