// vite.config.js
import { defineConfig } from "vite";

// CHANGE THIS to your repo name (the bit after your username)
const repo = "pro-bending-manager";

export default defineConfig({
  base: `/${repo}/`, // required so assets resolve at https://user.github.io/<repo>/
});
