import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api/image-proxy': {
        target: 'https://docs.google.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL('http://localhost' + path);
          const imageUrl = url.searchParams.get('url');
          if (imageUrl) {
            return new URL(imageUrl).pathname + new URL(imageUrl).search;
          }
          return path;
        },
        headers: {
          'Referer': 'https://docs.google.com/',
        },
      },
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
