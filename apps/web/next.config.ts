import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@rice/contracts', '@rice/model'],
  images: { formats: ['image/avif', 'image/webp'] },
};

export default nextConfig;
