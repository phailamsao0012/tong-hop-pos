// Build máy chủ Node cho PC (plan 2026-11-01-chay-web-pc-node, N2): đóng gói pc/*.ts thành dist/pc/*.js để PC chạy bằng
// `node dist/pc/server.js` không cần tsx. Bản web (dist/server, dist/client) vẫn build bằng `pnpm build` như Cloudflare.
import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    ssr: true,
    outDir: 'dist/pc',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rolldownOptions: {
      input: { server: 'pc/server.ts', hooks: 'pc/hooks.ts', 'd1-worker': 'pc/d1-worker.ts', 'd1-core': 'pc/d1-core.ts', 'cloudflare-workers': 'pc/cloudflare-workers.ts' },
      external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' },
    },
  },
});
