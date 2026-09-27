import Link from "next/link";

export default function BannedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4 text-center">
      <h1 className="text-2xl font-semibold text-white">Account unavailable</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-400">
        This Human AI account has been banned or disabled. If you believe this
        is a mistake, please contact support.
      </p>
      <Link href="/logout" className="btn-ghost mt-6 border border-ink-700">
        Log out
      </Link>
    </div>
  );
}
