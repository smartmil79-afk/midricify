import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { midricify: { navy: "#12233F", blue: "#2563EB", pale: "#EFF6FF" } } } },
  plugins: []
};
export default config;
