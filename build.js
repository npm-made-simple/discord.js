import { execSync } from "node:child_process";
execSync(process.platform === "win32"
    ? "rd /S /Q dist & npm i && npx tsc -b"
    : "rm -rf dist ; npm i && tsc -b"
    , { stdio: "inherit" }
);
