/** Static export: host the `out/` folder on GitHub Pages or Vercel. Set NEXT_PUBLIC_BASE_PATH=/repo-name for a Pages project site. */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
