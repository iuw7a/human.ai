"use client";

import { usePathname } from "next/navigation";

export function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isTeam = pathname?.startsWith("/admin/team-rema-humi") || pathname === "/admin/team";

  if (isTeam) {
    return (
      <div className="h-screen w-full overflow-hidden flex flex-col bg-black">
        {children}
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto w-full">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 pl-14 sm:px-8 lg:pl-8">
        {children}
      </div>
    </div>
  );
}
