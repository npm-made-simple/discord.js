import { execSync } from "node:child_process";
execSync(process.platform === "win32"
    ? "npm run build-windows"
    : "npm run build-unix"
    , { stdio: "inherit" }
);
