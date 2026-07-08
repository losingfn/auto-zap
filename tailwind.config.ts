import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./docs/**/*.md"],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#111827",
          900: "#1F2937",
          800: "#273244"
        },
        brand: {
          blue: "#2563EB"
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "Manrope", "Arial", "sans-serif"]
      },
      borderRadius: {
        card: "8px"
      }
    }
  }
};

export default config;
