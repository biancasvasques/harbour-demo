// Inline SVG icons: crisp on every device (emojis render differently per OS).
type P = { size?: number; className?: string };
const svg = (size: number, className: string | undefined, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
);
export const Anchor = ({ size = 20, className }: P) => svg(size, className, <>
  <circle cx="12" cy="5" r="2.5" /><path d="M12 7.5V21" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" /><path d="M8 11h8" />
</>);
export const Calendar = ({ size = 18, className }: P) => svg(size, className, <>
  <rect x="3" y="4.5" width="18" height="16.5" rx="3" /><path d="M8 2.5v4M16 2.5v4M3 10h18" />
</>);
export const Send = ({ size = 18, className }: P) => svg(size, className, <>
  <path d="M5 12h13" /><path d="m13 6 6 6-6 6" />
</>);
export const Arrow = ({ size = 16, className }: P) => svg(size, className, <path d="m9 6 6 6-6 6" />);
export const Check = ({ size = 14, className }: P) => svg(size, className, <path d="m5 12.5 4.5 4.5L19 7.5" />);
export const Video = ({ size = 16, className }: P) => svg(size, className, <>
  <rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="m15.5 10.5 6-3.5v10l-6-3.5" />
</>);
export const Building = ({ size = 16, className }: P) => svg(size, className, <>
  <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M10 21v-4h4v4" />
</>);
export const Close = ({ size = 16, className }: P) => svg(size, className, <path d="M6 6l12 12M18 6 6 18" />);
export const Star = ({ size = 28, className, filled }: P & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8}
    strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
);
