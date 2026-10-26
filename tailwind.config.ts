import type { Config } from "tailwindcss";

// Evening-cinema palette. Rules: gold (`marquee`) is for actions and always
// sits behind dark text; green (`live`) only means "on one of your services";
// coral (`flare`) only marks something new; lilac (`ebb`) only means
// "leaving a service soon".
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        night: {
          DEFAULT: "#101218",
          surface: "#181B23",
          raised: "#21252F",
          line: "#2D3240",
        },
        paper: { DEFAULT: "#EEF0F3", muted: "#9BA1AE", faint: "#6B7180" },
        marquee: { DEFAULT: "#F4B740", dark: "#D99A1E" },
        live: { DEFAULT: "#4ADE80", soft: "#163824" },
        flare: { DEFAULT: "#FF6B5B", soft: "#3A1C1A" },
        ebb: { DEFAULT: "#C4A1FF", soft: "#2A2140" },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
