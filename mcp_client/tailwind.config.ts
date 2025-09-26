import type { Config } from "tailwindcss";

export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	plugins: [],
	theme: {
		extend: {
			animation: {
				"gradient-background": "gradient-background 3s linear infinite",
			},
			backgroundImage: {
				ai: "linear-gradient(75deg, #232F3E, #FF9900, #FFAC33)",
				"ai-loop": "linear-gradient(75deg, #232F3E, #FF9900, #FFAC33, #FF9900, #232F3E)",
			},
			colors: {
				aws: {
					orange: "#FF9900",
					"orange-light": "#FFAC33",
					"orange-dark": "#E88B00",
					navy: "#232F3E",
					"navy-light": "#37475A",
					blue: "#146EB4",
					"blue-light": "#4A90E2",
					gray: {
						50: "#F8F9FA",
						100: "#F1F3F4",
						200: "#E8EAED",
						300: "#DADCE0",
						400: "#BDC1C6",
						500: "#9AA0A6",
						600: "#80868B",
						700: "#5F6368",
						800: "#3C4043",
						900: "#202124",
					},
				},
			},
			keyframes: {
				"gradient-background": {
					"0%": { backgroundPosition: "0% 0%" },
					"100%": { backgroundPosition: "200% 0%" },
				},
			},
		},
		fontFamily: {
			mono: [
				"ui-monospace",
				"SFMono-Regular",
				"Menlo",
				"Monaco",
				"Consolas",
				"Liberation Mono",
				"Courier New",
				"monospace",
			],
			system: [
				"-apple-system",
				"BlinkMacSystemFont",
				"Segoe UI",
				"Roboto",
				"Oxygen",
				"Ubuntu",
				"Cantarell",
				"Fira Sans",
				"Droid Sans",
				"Helvetica Neue",
				"sans-serif",
			],
		},
	},
} satisfies Config;
