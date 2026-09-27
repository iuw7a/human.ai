import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4 text-center">
      <h1 className="text-2xl font-semibold text-white">Page not found</h1>
      <p className="mt-2 text-sm text-zinc-500">
        This Human AI page does not exist.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Back to Human AI
      </Link>
    </div>
  );
}
