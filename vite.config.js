import { defineConfig } from "vite";

export default defineConfig({
  base: "/ga/",
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.js"],
  },
});
