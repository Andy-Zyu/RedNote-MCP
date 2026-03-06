const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Copy web directory to dist
function copyWebFiles() {
  const srcWeb = path.join(__dirname, 'src/web');
  const distWeb = path.join(__dirname, 'dist/web');

  // Create dist/web directory
  if (!fs.existsSync(distWeb)) {
    fs.mkdirSync(distWeb, { recursive: true });
  }

  // Copy all files from src/web to dist/web
  const files = fs.readdirSync(srcWeb);
  files.forEach(file => {
    const srcFile = path.join(srcWeb, file);
    const distFile = path.join(distWeb, file);
    fs.copyFileSync(srcFile, distFile);
    console.log(`✅ Copied ${file} to dist/web/`);
  });
}

// MCP Server build (existing)
esbuild.build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/cli.js',
  format: 'cjs',
  minify: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  minifyWhitespace: true,
  treeShaking: true,
  banner: {
    js: '// PigBun AI - pigbun-rednote-mcp\n// https://pigbunai.com',
  },
  external: ['patchright', 'patchright-core', 'chromium-bidi'],
  legalComments: 'none',
}).then(() => {
  console.log('✅ Bundle + minify done → dist/cli.js');
  // Copy web files after build
  copyWebFiles();
}).catch((e) => {
  console.error(e);
  process.exit(1);
});

// OpenClaw Plugin build
esbuild.build({
  entryPoints: ['src/openclaw/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/openclaw/index.js',
  format: 'cjs',
  minify: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  minifyWhitespace: true,
  treeShaking: true,
  banner: {
    js: '// PigBun AI - pigbun-rednote-mcp (OpenClaw Plugin)\n// https://pigbunai.com',
  },
  external: ['patchright', 'patchright-core', 'chromium-bidi', '@sinclair/typebox'],
  legalComments: 'none',
}).then(() => {
  console.log('✅ Bundle + minify done → dist/openclaw/index.js');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
