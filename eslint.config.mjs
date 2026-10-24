import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    // Private runtime state and generated local verification bundles.
    ".data/**",
        "coverage/**",
    // Separate package with its own toolchain (Cloudflare Worker).
    "deploy/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    // Local Claude Code state, including agent worktrees (full repo copies).
    ".claude/**",
    "frontend/contracts.d.ts", "frontend/model-types.d.ts", "frontend/app/**", "frontend/components/**", "frontend/lib/**", "frontend/public/**", "frontend/.next/**", "lib/views/generated/**",
  ]),
  // AGENTS.md: hand-written files stay at or below 300 lines.
  {
    ignores: ["lib/frontend/registry.ts", "lib/frontend/resources.ts", "**/*.d.ts"],
    rules: { "max-lines": ["error", { max: 300, skipBlankLines: false, skipComments: false }] },
  },
]);

export default eslintConfig;
