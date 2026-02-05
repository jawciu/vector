import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");

const publicEnv = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (key.startsWith("NEXT_PUBLIC_")) {
        publicEnv[key] = value;
        process.env[key] = value;
      }
    }
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: publicEnv,
};

export default nextConfig;
