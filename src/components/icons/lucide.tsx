import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function LucideIcon({ children, className, ...props }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M20 10c0 4.99-5.54 10.19-7.4 11.79a.92.92 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </LucideIcon>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M13.83 16.57a1 1 0 0 0 1.06.24l2.27-.98a1 1 0 0 1 1.17.29l1.25 1.53a1 1 0 0 1-.11 1.38 5.08 5.08 0 0 1-3.18 1.12C9.51 20.15 3.85 14.49 3.85 7.71c0-1.18.41-2.31 1.12-3.18a1 1 0 0 1 1.38-.11l1.53 1.25a1 1 0 0 1 .29 1.17l-.98 2.27a1 1 0 0 0 .24 1.06z" />
    </LucideIcon>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a2 2 0 0 1-2.06 0L2 7" />
    </LucideIcon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </LucideIcon>
  );
}

export function CircleCheckIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </LucideIcon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="m15 18-6-6 6-6" />
    </LucideIcon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="m9 18 6-6-6-6" />
    </LucideIcon>
  );
}

export function XIcon(props: IconProps) {
  return (
    <LucideIcon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </LucideIcon>
  );
}
