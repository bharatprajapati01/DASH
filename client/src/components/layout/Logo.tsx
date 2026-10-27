export function Logo({ size = 36, withText = true, dark = true }: { size?: number; withText?: boolean; dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden>
        <rect width="36" height="36" rx="11" fill="#FF896D" />
        <path d="M11 27V10h12v4.2h-7v2.6h5.6v4H16V27z" fill="#292929" />
        <circle cx="25.5" cy="24.5" r="3" fill="#FFE735" />
      </svg>
      {withText && <span className={`text-xl font-extrabold tracking-tight ${dark ? "text-white" : "text-ink"}`}>FIBNK</span>}
    </span>
  );
}
