import { defineConfig } from "vite";

export default defineConfig({
  base: "/social/",
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.js"],
  },
});
