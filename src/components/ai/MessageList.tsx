"use client";

import { useEffect, useRef } from "react";

/** Scroll container that follows the conversation tail. */
export function MessageList({
  scrollKey,
  children,
}: {
  scrollKey: string | number;
  children: React.ReactNode;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [scrollKey]);

  return (
    <div className="no-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:space-y-6 sm:px-6">
        {children}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
