import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  server: {
    host: true, // Listen on all network addresses (0.0.0.0)
    port: 5173,
  },
  resolve: {
    extensions: [".jsx", ".js", ".tsx", ".ts", ".json"],
  },
  ssr: {
    // Prevent three.js / R3F from being loaded server-side
    noExternal: [],
    external: ["three", "@react-three/fiber", "@react-three/drei", "gsap"],
  },
});
