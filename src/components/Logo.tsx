import Link from 'next/link';

type Props = {
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  variant?: 'dark' | 'light';
  showWordmark?: boolean;
};

const SIZES = {
  sm: { box: 28, text: 'text-base' },
  md: { box: 36, text: 'text-xl' },
  lg: { box: 56, text: 'text-3xl' },
};

export function Logo({ size = 'md', href, variant = 'dark', showWordmark = true }: Props) {
  const s = SIZES[size];
  const inner = (
    <div className="flex items-center gap-2">
      <svg
        width={s.box}
        height={s.box}
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="TruckOS"
      >
        <defs>
          <linearGradient id={`brand-${size}`} x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0EA5E9" />
            <stop offset="1" stopColor="#0369A1" />
          </linearGradient>
          <linearGradient id={`amber-${size}`} x1="0" y1="0" x2="0" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FBBF24" />
            <stop offset="1" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="10" fill={`url(#brand-${size})`} />
        {/* cabine */}
        <path d="M7 22 L7 14 L25 14 L30 19 L30 32 L7 32 Z" fill="#FFFFFF" />
        {/* carroceria */}
        <rect x="30" y="16" width="10" height="16" fill="#FFFFFF" />
        {/* janela */}
        <rect x="10" y="17" width="13" height="6" fill={`url(#brand-${size})`} opacity="0.5" />
        {/* faixa amarela */}
        <rect x="7" y="27" width="33" height="2" fill={`url(#amber-${size})`} />
        {/* rodas */}
        <circle cx="13" cy="35" r="3.2" fill="#0F172A" />
        <circle cx="13" cy="35" r="1.3" fill="#94A3B8" />
        <circle cx="34" cy="35" r="3.2" fill="#0F172A" />
        <circle cx="34" cy="35" r="1.3" fill="#94A3B8" />
      </svg>
      {showWordmark && (
        <span
          className={`font-extrabold tracking-tight ${s.text} ${
            variant === 'light' ? 'text-white' : 'text-slate-900'
          }`}
        >
          Truck<span className="text-sky-600">OS</span>
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-sky-400">
        {inner}
      </Link>
    );
  }
  return inner;
}