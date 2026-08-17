import type { SVGProps } from 'react'

/**
 * A small, consistent icon set drawn on a 16px grid with a 1.5 stroke. Inline
 * SVG keeps the bundle free of an icon dependency and keeps the stroke weight
 * identical everywhere.
 */
type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconDashboard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="2" width="5" height="6" rx="1" />
    <rect x="9" y="2" width="5" height="3.5" rx="1" />
    <rect x="2" y="10" width="5" height="4" rx="1" />
    <rect x="9" y="7.5" width="5" height="6.5" rx="1" />
  </Icon>
)

export const IconList = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
    <circle cx="2.75" cy="4" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="2.75" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="2.75" cy="12" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconBudget = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 14A6 6 0 1 1 14 8" />
    <path d="M8 8l4.2-2.4" />
    <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconRepeat = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7V6a2.5 2.5 0 0 1 2.5-2.5H12" />
    <path d="M10 1.5 12.5 3.5 10 5.5" />
    <path d="M13 9v1a2.5 2.5 0 0 1-2.5 2.5H4" />
    <path d="M6 10.5 3.5 12.5 6 14.5" />
  </Icon>
)

export const IconAnalytics = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 13.5h12" />
    <path d="M4 11V7.5M7.5 11V4M11 11V9" />
  </Icon>
)

export const IconWallet = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="4" width="12" height="9" rx="2" />
    <path d="M2 7h12" />
    <circle cx="11" cy="10" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5 3.4 3.4" />
  </Icon>
)

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14" />
  </Icon>
)

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
)

export const IconFilter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
  </Icon>
)

export const IconArrowUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 13V3.5M4 7l4-3.5L12 7" />
  </Icon>
)

export const IconArrowDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3v9.5M4 9l4 3.5L12 9" />
  </Icon>
)

export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.9 3.1l-1 1M4.1 11.9l-1 1M12.9 12.9l-1-1M4.1 4.1l-1-1" />
  </Icon>
)

export const IconMoon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" />
  </Icon>
)

export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </Icon>
)

export const IconCalendar = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="3" width="12" height="11" rx="2" />
    <path d="M2 6.5h12M5.5 1.5V4M10.5 1.5V4" />
  </Icon>
)

export const IconTrend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 11 6 7l2.5 2.5L14 4" />
    <path d="M10.5 4H14v3.5" />
  </Icon>
)

export const IconInbox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 9.5 4 3.5h8l2 6" />
    <path d="M2 9.5h3.5l1 2h3l1-2H14v2.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12Z" />
  </Icon>
)

export const IconTransfer = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 5.5h9M9 3 11.5 5.5 9 8" />
    <path d="M13.5 10.5h-9M7 8 4.5 10.5 7 13" />
  </Icon>
)

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2v8M5 7.5 8 10.5l3-3" />
    <path d="M2.5 12.5h11" />
  </Icon>
)

export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 10.5v-8M5 5.5 8 2.5l3 3" />
    <path d="M2.5 12.5h11" />
  </Icon>
)

export const IconTag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.6 2.3H13a.7.7 0 0 1 .7.7v5.4a1 1 0 0 1-.3.7l-4.6 4.6a1 1 0 0 1-1.4 0L2.6 8.6a1 1 0 0 1 0-1.4l4.3-4.6Z" />
    <circle cx="10.6" cy="5.4" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.25v4M8 5.25v.1" />
  </Icon>
)

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5 8 10.5l4-4" />
  </Icon>
)

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </Icon>
)

export const IconLogo = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...p}>
    <rect width="24" height="24" rx="6" fill="var(--ink-accent)" />
    <path
      d="M7 6.5v11h10"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M10.5 13.5 13 11l2 2 2.5-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
  </svg>
)
