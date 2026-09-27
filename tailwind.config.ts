import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#09090b",
          900: "#0e0e11",
          850: "#131316",
          800: "#1a1a1f",
          700: "#26262c",
          600: "#3a3a42",
        },
        accent: {
          DEFAULT: "#e5484d",
          hover: "#f2555a",
          muted: "#a02a2e",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
