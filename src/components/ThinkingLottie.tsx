"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

/**
 * Lottie animation shown while the AI is thinking / searching the web.
 * Red-tinted via CSS filter, autoplay, loop, no controls.
 */
export default function ThinkingLottie({ size = 36 }: { size?: number }) {
  return (
    <div
      className="shrink-0"
      style={{
        width: size,
        height: size,
        filter:
          "brightness(0) saturate(100%) invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)",
      }}
    >
      <DotLottieReact
        src="https://lottie.host/0b873668-6951-44aa-a7c4-87c36fc20dd8/pGJzLRlVQo.lottie"
        autoplay
        loop
      />
    </div>
  );
}
