// vite.config.js
import { defineConfig } from "vite";

// CHANGE THIS to your repo name (the bit after your username):
const repo = "pro-bending-manager"; // <-- e.g. "pro-bending-manager"

export default defineConfig({
  base: `/${repo}/`, // Pages serves from /<repo>/
});
