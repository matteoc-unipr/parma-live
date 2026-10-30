// Icone SVG del design (viewBox 24, stroke 2–2.4).
type P = { size?: number }

export const MapIcon = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4ZM9 4v14M15 6v14" />
  </svg>
)
export const SearchIcon = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
)
export const TrainIcon = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="3" width="14" height="14" rx="4" />
    <path d="M5 10.5h14M8.5 21l2-4M15.5 21l-2-4" />
  </svg>
)
const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z'
export const StarIcon = ({ size = 24, filled = false }: P & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d={STAR} />
  </svg>
)
export const InfoIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6" />
    <circle cx="12" cy="7.6" r="0.4" fill="currentColor" />
  </svg>
)
export const LocateIcon = ({ size = 22, denied = false, cutColor }: P & { denied?: boolean; cutColor?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M20.5 3.5 3.5 10.8l7.2 2 2 7.2z" fill="currentColor" />
    {denied && (
      <>
        <path d="M3 3l18 18" stroke={cutColor} strokeWidth="5" strokeLinecap="round" />
        <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </>
    )}
  </svg>
)
export const CloseIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
export const BackIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 5l-7 7 7 7" />
  </svg>
)
export const ChevronIcon = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5l7 7-7 7" />
  </svg>
)
export const LiveIcon = ({ size = 11 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
    <circle cx="5" cy="19" r="2" fill="currentColor" stroke="none" />
  </svg>
)
export const ClockIcon = ({ size = 13 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)
export const MoonIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
)
export const PinIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M12 21s7-6.3 7-11.5a7 7 0 0 0-14 0C5 14.7 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
)
export const CancelIcon = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </svg>
)
