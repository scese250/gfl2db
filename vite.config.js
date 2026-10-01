import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api/sheet-proxy': {
        target: 'https://docs.google.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL('http://localhost' + path);
          const targetUrl = url.searchParams.get('url');
          if (targetUrl) {
            const parsed = new URL(targetUrl);
            return parsed.pathname + parsed.search;
          }
          return path;
        },
      },
    },
  },
});
