/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        charcoal: "#292929",
        coral: { DEFAULT: "#FF896D", hover: "#FF7658", light: "#FFF0EB" },
        sun: "#FFE735",
        lime: "#C7FF24",
        lilac: "#D9D1FF",
        sky: "#DDF4FF",
        ink: "#292929",
        muted: "#777777",
        line: "#F0D5CE",
        success: "#48A868",
        warning: "#FFB547",
        danger: "#FF6262",
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      borderRadius: { card: "20px" },
      boxShadow: {
        soft: "0 2px 10px rgba(41,41,41,0.06)",
        lift: "0 8px 24px rgba(41,41,41,0.12)",
      },
    },
  },
  plugins: [],
};
