const esbuild = require('esbuild');

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
