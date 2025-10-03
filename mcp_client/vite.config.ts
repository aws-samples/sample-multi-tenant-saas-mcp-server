import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	define: {
		global: 'globalThis',
		// For production, API calls will go through CloudFront to API Gateway
		__API_BASE_URL__: JSON.stringify(process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001'),
	},
	server: {
		host: '0.0.0.0',
		port: 5173,
		proxy: {
			"^/api/.*": {
				target: "http://localhost:3001",
				changeOrigin: true,
				secure: false,
			},
		},
	},
	build: {
		outDir: "dist",
		sourcemap: true,
		rollupOptions: {
			output: {
				manualChunks: {
					vendor: ['react', 'react-dom'],
					ai: ['@ai-sdk/react', 'ai'],
				},
			},
		},
	},
	optimizeDeps: {
		exclude: ['@modelcontextprotocol/sdk'],
		include: ['ajv'],
	},
	ssr: {
		noExternal: ['@modelcontextprotocol/sdk'],
	},
	resolve: {
		alias: {
			// Fix ajv ES modules compatibility
			'ajv': 'ajv/dist/ajv.min.js',
		},
	},
});
