import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Human AI home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.webp"
        alt="Human AI logo"
        className="h-8 w-8 rounded-lg object-cover"
      />
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight text-white">
          Human AI
        </span>
      )}
    </Link>
  );
}

export function AvatarMark({ size = 28 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.webp"
      alt="Human AI"
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}
