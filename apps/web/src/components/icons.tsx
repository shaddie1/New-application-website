import type { SVGProps } from 'react';

/**
 * Line icons, drawn on a 24px grid so they sit evenly inside an IconChip.
 * Hand-rolled rather than a dependency: the set is small and the static export
 * ships less JavaScript this way.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

// ── Services ────────────────────────────────────────────────────────────────

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
    <path d="M9.5 20v-5.5h5V20" />
  </Svg>
);

export const OfficeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 21h18" />
    <path d="M5 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" />
    <path d="M14 21V9h4a1 1 0 0 1 1 1v11" />
    <path d="M8 8h3M8 12h3M8 16h3M17 13h.01M17 17h.01" />
  </Svg>
);

export const MedicalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 4.5 6.5V12c0 4.6 3.1 7.6 7.5 8.8 4.4-1.2 7.5-4.2 7.5-8.8V6.5Z" />
    <path d="M12 9v6M9 12h6" />
  </Svg>
);

export const HardHatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 17h17" />
    <path d="M5 17v-2a7 7 0 0 1 14 0v2" />
    <path d="M10 4.6A7 7 0 0 1 14 4.6" />
    <path d="M10 4.5V9M14 4.5V9" />
  </Svg>
);

export const SofaIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
    <path d="M4 11a2 2 0 0 0-2 2v4h20v-4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v1H6v-1a2 2 0 0 0-2-2Z" />
    <path d="M5 17v2M19 17v2" />
  </Svg>
);

export const RugIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16v12H4z" />
    <path d="M4 9h16M4 15h16" />
    <path d="M7 4v2M12 4v2M17 4v2M7 18v2M12 18v2M17 18v2" />
  </Svg>
);

export const PestIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="13" rx="4" ry="6" />
    <path d="M12 7V5" />
    <path d="M10.5 4 12 5l1.5-1" />
    <path d="M8 10 4.5 8M8 13H4M8 16l-3.5 2M16 10l3.5-2M16 13h4M16 16l3.5 2" />
  </Svg>
);

export const AirIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="7" rx="2" />
    <path d="M6.5 8.5h11" />
    <path d="M7 15c0 1.5 1.5 1.5 1.5 3M12 15c0 2 1.5 2 1.5 4M17 15c0 1.5 1.5 1.5 1.5 3" />
  </Svg>
);

// ── Trust / benefits ────────────────────────────────────────────────────────

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 5 6.2V12c0 4.4 2.9 7.4 7 8.5 4.1-1.1 7-4.1 7-8.5V6.2Z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const BadgeCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.2 14 5l2.6-.3.7 2.5 2.2 1.4-1 2.4 1 2.4-2.2 1.4-.7 2.5-2.6-.3-2 1.8-2-1.8-2.6.3-.7-2.5L4.5 14l1-2.4-1-2.4 2.2-1.4.7-2.5L10 5.1Z" />
    <path d="m9.2 12 1.9 1.9 3.7-3.8" />
  </Svg>
);

export const TagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 12.5 12 4h7.5v7.5L11 20a1.5 1.5 0 0 1-2.1 0l-5.4-5.4a1.5 1.5 0 0 1 0-2.1Z" />
    <circle cx="15.5" cy="8.5" r="1.3" />
  </Svg>
);

export const LeafIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19c0-8 5-13 14-13 0 9-4.5 13-10 13a5.6 5.6 0 0 1-4-1.4Z" />
    <path d="M9 15c1.5-3 4-5.5 7.5-7" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Svg>
);

export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8.5h3.2L8 6h8l1.8 2.5H21v10H3z" />
    <circle cx="12" cy="13" r="3.2" />
  </Svg>
);

// ── Flow / contact ──────────────────────────────────────────────────────────

export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" />
    <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
  </Svg>
);

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17M8 3.5V6M16 3.5V6" />
  </Svg>
);

export const PhonePayIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 18.5h3" />
    <path d="M9.5 8.5h5M12 6.5v6" />
  </Svg>
);

export const SparkleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z" />
    <path d="M18.5 3.5v3M20 5h-3" />
  </Svg>
);

export const StarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.7l5.4-.8Z" />
  </Svg>
);

export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3.5h3.5L10 8l-2 1.5a11 11 0 0 0 4.5 4.5L14 12l4.5 1.5V17a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 3 5.7 2 2 0 0 1 5 3.5Z" />
  </Svg>
);

export const MailIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </Svg>
);

export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </Svg>
);

export const WhatsAppIcon = (p: IconProps) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.2 8.2 0 0 1 8.24 8.24c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z" />
  </svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12h15M13.5 6l6 6-6 6" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19.5c0-3 2.7-5 6-5s6 2 6 5" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 6M17.5 14.8c2 .6 3.5 2.3 3.5 4.7" />
  </Svg>
);

export const BuildingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 21h18" />
    <path d="M4 21V8l6-3.5V21" />
    <path d="M10 21V11h6a1 1 0 0 1 1 1v9" />
    <path d="M6.5 10h1M6.5 13.5h1M6.5 17h1M13 14h1M13 17.5h1" />
  </Svg>
);
