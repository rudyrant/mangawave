import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0f",
        panel: "#12121a",
        panelSoft: "#181824",
        line: "#2d2d3d",
        accent: "#8b5cf6",
        accentSoft: "#1d1633",
        text: "#f3f4f6",
        muted: "#9ca3af",
        success: "#34d399",
      },
      boxShadow: {
        glow: "0 12px 40px rgba(139, 92, 246, 0.18)",
      },
      backgroundImage: {
        mesh: "radial-gradient(circle at top, rgba(139, 92, 246, 0.25), transparent 30%), radial-gradient(circle at 80% 20%, rgba(14, 165, 233, 0.18), transparent 25%)",
      },
    },
  },
  plugins: [],
};

export default config;
