import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter Variable", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        canvas:  "#F7F5F2",
        surface: "#FFFFFF",
        ink: {
          DEFAULT: "#1C1917",
          2: "#57534E",
          3: "#A8A29E",
          4: "#D6D3D1",
        },
        sage: {
          DEFAULT: "#3D6B4F",
          50:  "#F0F7F3",
          100: "#D6EBE0",
          200: "#AACFBC",
          400: "#6FAE8B",
          500: "#3D6B4F",
          600: "#2E5340",
          700: "#1E3829",
        },
        rose: {
          50:  "#FFF1F2",
          100: "#FFE4E6",
          200: "#FECDD3",
          500: "#F43F5E",
          600: "#E11D48",
        },
        amber: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
        },
        sky: {
          50:  "#F0F9FF",
          100: "#E0F2FE",
          200: "#BAE6FD",
          500: "#0EA5E9",
          600: "#0284C7",
          700: "#0369A1",
        },
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
        xs:    ["11px", { lineHeight: "16px" }],
        sm:    ["13px", { lineHeight: "20px" }],
        base:  ["14px", { lineHeight: "22px" }],
        md:    ["15px", { lineHeight: "24px" }],
        lg:    ["17px", { lineHeight: "26px" }],
        xl:    ["20px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "32px" }],
        "3xl": ["30px", { lineHeight: "38px" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        full: "9999px",
      },
      boxShadow: {
        xs:   "0 1px 2px 0 rgb(0 0 0 / 0.04)",
        card: "0 0 0 1px rgb(0 0 0 / 0.06), 0 2px 6px rgb(0 0 0 / 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
