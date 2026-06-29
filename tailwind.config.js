/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  // Manual dark mode: toggled via NativeWind's colorScheme (see src/lib/theme.ts),
  // not the OS setting, so the in-app Settings switch is authoritative.
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
};
