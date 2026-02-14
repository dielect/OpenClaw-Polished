import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        assetsDir: "assets",
    },
    base: "/setup/",
    server: {
        proxy: {
            "/setup/api": {
                target: "http://localhost:8080",
                changeOrigin: true,
            },
            "/setup/export": {
                target: "http://localhost:8080",
                changeOrigin: true,
            },
            "/setup/import": {
                target: "http://localhost:8080",
                changeOrigin: true,
            },
            "/healthz": {
                target: "http://localhost:8080",
                changeOrigin: true,
            },
            "/setup/terminal": {
                target: "ws://localhost:8080",
                ws: true,
            },
        },
    },
});
