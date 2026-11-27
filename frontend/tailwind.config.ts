import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // CSS variable-based design tokens (shadcn/ui convention)
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        // Custom brand colors — update with ASN Platform brand guide
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "2px",
      },
      boxShadow: {
        "2xs": "0 1px 2px 0 rgb(0 0 0 / 0.03)",
        "xs": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      backdropBlur: {
        xs: "2px",
      },
      fontFamily: {
        // Body text, tables, forms: Lato. Headings, titles, buttons, labels: Roboto (font-heading).
        // Self-hosted via @fontsource. Chinese fallbacks so zh-CN text never falls back to a random system font.
        sans: ["Lato", "system-ui", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "sans-serif"],
        heading: ["Roboto", "system-ui", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "sans-serif"],
        // Only for PO numbers, HU / SSCC numbers and XML.
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      /*
       * Fluid type scale: grows gently between 1280 px and 1600–1920 px screens.
       * Body ≈ 15–16 px, table / label text 13–14 px, page titles 24–28 px.
       */
      fontSize: {
        xs: ["clamp(0.8125rem, 0.5625rem + 0.3125vw, 0.875rem)", { lineHeight: "1.25rem" }],
        sm: ["clamp(0.875rem, 0.625rem + 0.3125vw, 0.9375rem)", { lineHeight: "1.375rem" }],
        base: ["clamp(0.9375rem, 0.8125rem + 0.15625vw, 1rem)", { lineHeight: "1.5rem" }],
        lg: ["clamp(1.0625rem, 0.9375rem + 0.15625vw, 1.125rem)", { lineHeight: "1.625rem" }],
        xl: ["clamp(1.1875rem, 0.9375rem + 0.3125vw, 1.3125rem)", { lineHeight: "1.75rem" }],
        "2xl": ["clamp(1.5rem, 1rem + 0.625vw, 1.75rem)", { lineHeight: "2.125rem" }],
      },
      // Uppercase labels use one letter-spacing everywhere (0.06em).
      letterSpacing: {
        wide: "0.06em",
        wider: "0.06em",
        widest: "0.06em",
      },
      keyframes: {
        "page-fade": { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        "page-fade": "page-fade 150ms ease-out",
      },
      transitionTimingFunction: {
        "out-soft": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
