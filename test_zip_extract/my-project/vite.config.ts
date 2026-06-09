import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    extensions: [".jsx", ".js", ".tsx", ".ts", ".json"],
  },
  ssr: {
    // Prevent three.js / R3F from being loaded server-side
    noExternal: [],
    external: ["three", "@react-three/fiber", "@react-three/drei", "gsap"],
  },
});
