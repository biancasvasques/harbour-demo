import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // the tender walkthrough is a single static page in public/
  async rewrites() {
    return [{ source: '/tender', destination: '/tender.html' }];
  },
};

export default nextConfig;
