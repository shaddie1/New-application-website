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
