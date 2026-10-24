import { build } from 'esbuild';
await build({
  entryPoints: ['lib/agents/telegram/bindings.ts'], outfile: 'dist/inventory-telegram.mjs',
  bundle: true, platform: 'node', target: 'node22', format: 'esm',
  external: ['@prisma/client', '@spaceworks-hq/agents/*', 'sharp'],
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  plugins: [{ name: 'telegram-server-boundary', setup(builder) {
    builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }));
    builder.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
    builder.onResolve({ filter: /^(next-auth|next\/navigation)(\/|$)/ }, () => ({ errors: [{ text: 'Telegram worker must not evaluate browser authentication or request functions.' }] }));
    builder.onResolve({ filter: /^next\/headers$/ }, () => ({ path: 'next/headers', namespace: 'no-request' }));
    builder.onLoad({ filter: /.*/, namespace: 'no-request' }, () => ({ loader: 'js', contents: 'export function headers() { throw new Error("No request in Telegram worker."); }' }));
  } }], logLevel: 'info',
});
