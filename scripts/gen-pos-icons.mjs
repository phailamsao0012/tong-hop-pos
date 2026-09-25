// Sinh biểu tượng POS cho app từ lib/pos-icons.ts: iPhone (imageset SVG, tô theo màu chữ) và Android (VectorDrawable).
// Chạy: node scripts/gen-pos-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
const { POS_ICONS: icons } = await import('../lib/pos-icons.ts'); // Node 24 đọc thẳng TypeScript
const key = (id) => `pos_${id.replace(/-/g, '_')}`;
for (const i of icons) {
  const dir = `ios/Megatech/Megatech/Assets.xcassets/${key(i.id)}.imageset`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${key(i.id)}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${i.paths.map((d) => `<path d="${d}"/>`).join('')}</svg>\n`);
  writeFileSync(`${dir}/Contents.json`, JSON.stringify({ images: [{ filename: `${key(i.id)}.svg`, idiom: 'universal' }], info: { author: 'xcode', version: 1 }, properties: { 'preserves-vector-representation': true, 'template-rendering-intent': 'template' } }, null, 2) + '\n');
  mkdirSync('android/app/src/main/res/drawable', { recursive: true });
  writeFileSync(`android/app/src/main/res/drawable/${key(i.id)}.xml`, `<?xml version="1.0" encoding="utf-8"?>
<!-- Sinh tự động từ lib/pos-icons.ts (scripts/gen-pos-icons.mjs). Tô màu bằng tint. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
${i.paths.map((d) => `  <path android:pathData="${d}" android:strokeColor="#FF000000" android:strokeWidth="1.7" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000"/>`).join('\n')}
</vector>
`);
}
console.log(`${icons.length} biểu tượng: ${icons.map((i) => key(i.id)).join(', ')}`);
