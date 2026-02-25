const esbuild = require('esbuild');

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
  external: ['playwright'],
  legalComments: 'none',
}).then(() => {
  console.log('✅ Bundle + minify done → dist/cli.js');
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
  external: ['playwright', '@sinclair/typebox'],
  legalComments: 'none',
}).then(() => {
  console.log('✅ Bundle + minify done → dist/openclaw/index.js');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
