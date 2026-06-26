/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          950: "#070b14",
          900: "#0d1424",
          800: "#131d33",
          700: "#1a2744",
        },
        accent: {
          DEFAULT: "#22d3ee",
          muted: "#0891b2",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(34, 211, 238, 0.12)",
        "glow-lg": "0 0 60px rgba(34, 211, 238, 0.18), 0 25px 50px rgba(0, 0, 0, 0.35)",
      },
      animation: {
        "fade-in": "fadeIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in-up": "fadeInUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};