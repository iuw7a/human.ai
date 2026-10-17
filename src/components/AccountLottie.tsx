"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

/**
 * Decorative Lottie animation for the account page (user-supplied).
 * Client component because the player needs the DOM.
 */
export default function AccountLottie() {
  return (
    <div className="mx-auto mb-4 h-40 w-40 sm:h-48 sm:w-48">
      <DotLottieReact
        src="https://lottie.host/d3130b0a-7da4-4369-a1a9-d5d5f9ed201f/AS0GJN6nYl.lottie"
        autoplay
        loop
      />
    </div>
  );
}
