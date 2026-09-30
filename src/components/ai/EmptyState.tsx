"use client";

import { motion } from "framer-motion";

export function EmptyState({
  avatar,
  title = "How can I help you?",
  subtitle,
}: {
  avatar: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-[46vh] flex-col items-center justify-center px-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.21, 1.02, 0.73, 1] }}
      >
        {avatar}
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08 }}
        className="mt-6 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl"
      >
        {title}
      </motion.h1>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16 }}
          className="mt-3 max-w-md text-[15px] leading-6 text-zinc-400"
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}
