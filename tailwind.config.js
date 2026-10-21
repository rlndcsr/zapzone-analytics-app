/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Tailwind ships 90/95/100 and no way to express anything between as an
      // arbitrary value (`scale-[0.97]` generates nothing). 5% off a full-width
      // button or a card reads as a collapse rather than a press, so the large
      // surfaces need a gentler step of their own — see PRESS_SCALE_CLASS in
      // components/navigation/navMotion.ts.
      scale: {
        97: "0.97",
      },
    },
  },
  plugins: [],
};
