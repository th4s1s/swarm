export function SwarmMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      style={{ filter: 'drop-shadow(0 0 6px rgba(41,255,160,0.6))' }}
    >
      <g stroke="rgb(var(--primary))" strokeWidth="1" opacity="0.55">
        <line x1="16" y1="8" x2="9" y2="14" />
        <line x1="16" y1="8" x2="23" y2="14" />
        <line x1="9" y1="14" x2="11" y2="23" />
        <line x1="23" y1="14" x2="21" y2="23" />
        <line x1="11" y1="23" x2="21" y2="23" />
        <line x1="9" y1="14" x2="23" y2="14" />
      </g>
      <g fill="rgb(var(--primary))">
        <circle cx="16" cy="8" r="2.6" />
        <circle cx="9" cy="14" r="2.6" />
        <circle cx="23" cy="14" r="2.6" />
        <circle cx="11" cy="23" r="2.6" />
        <circle cx="21" cy="23" r="2.6" />
      </g>
    </svg>
  );
}
