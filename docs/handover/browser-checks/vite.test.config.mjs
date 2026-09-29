// Dev server for automated play tests: no hot reload, so editing files doesn't reload the page mid-test.
export default {
  root: '/home/user/quarry',
  base: './',
  publicDir: 'assets',
  server: { port: 5174, strictPort: true, hmr: false, watch: null },
};
