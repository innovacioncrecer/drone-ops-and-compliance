import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'DroneOps and Communications',
    short_name: 'DroneOps',
    description: 'Comunicaciones y operaciones de drones.',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#101214',
    theme_color: '#101214',
    icons: [
      { src: '/pwa/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}