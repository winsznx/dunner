/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0F0F11",
          surface: "#1A1A1E",
          elevated: "#242428",
        },
        ink: {
          primary: "#EEEEEF",
          secondary: "#A0A0AB",
          muted: "#6C6C74",
        },
        accent: {
          recovery: "#10B981",
          failure: "#EF4444",
          neutral: "#22D3EE",
        },
        border: {
          subtle: "#2A2A2F",
          DEFAULT: "#3A3A3F",
        },
      },
      fontFamily: {
        sans: ["Inter_400Regular"],
        "sans-medium": ["Inter_500Medium"],
        "sans-semibold": ["Inter_600SemiBold"],
        "sans-bold": ["Inter_700Bold"],
        mono: ["JetBrainsMono_400Regular"],
        "mono-semibold": ["JetBrainsMono_600SemiBold"],
      },
      fontSize: {
        xs: "11px",
        sm: "13px",
        base: "15px",
        lg: "17px",
        xl: "20px",
        "2xl": "24px",
        "3xl": "32px",
        "4xl": "48px",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "28px",
      },
    },
  },
  plugins: [],
};
