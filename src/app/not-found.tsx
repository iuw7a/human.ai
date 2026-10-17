import Link from "next/link";
import NotFoundLottie from "@/components/NotFoundLottie";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-4 text-center">
      <div className="absolute inset-0">
        <NotFoundLottie />
      </div>
      <div className="relative z-10">
        <h1 className="text-2xl font-semibold text-white drop-shadow-lg">Page not found</h1>
        <p className="mt-2 text-sm text-zinc-300 drop-shadow">
          This Human AI page does not exist.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-[#6b1519] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#8a1c20] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6b1519]/60"
        >
          Back to Human AI
        </Link>
      </div>
    </div>
  );
}
