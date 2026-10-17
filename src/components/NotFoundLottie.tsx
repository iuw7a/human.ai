"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

/**
 * Lottie animation shown on the 404 / not-found page.
 * (User-supplied animation, autoplay + loop.)
 */
export default function NotFoundLottie() {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="h-full w-full">
        <DotLottieReact
          src="https://lottie.host/c8fb011b-5d89-444a-b107-1a54377b0742/LvZgDJ0q8o.lottie"
          loop
          autoplay
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
