import { cpSync, existsSync } from "node:fs";
if (!existsSync(".next/standalone/server.js"))
  throw new Error("Standalone build is missing. Run npm run build first.");
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public"))
  cpSync("public", ".next/standalone/public", { recursive: true });
console.log("Standalone assets copied. Start with npm start.");
