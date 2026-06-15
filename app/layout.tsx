import '../styles/globals.css';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: {
    default: 'DroneOps and Communications | Video conferencing and drone operations platform',
    template: '%s',
  },
  description:
    'DroneOps and Communications is a platform for real-time video conferencing and drone operations management, built on open source WebRTC technology.',
  twitter: {
    creator: '@innovacioncrecer',
    site: '@innovacioncrecer',
    card: 'summary_large_image',
  },
  openGraph: {
    url: 'https://github.com/innovacioncrecer/drone-ops-and-compliance',
    images: [
      {
        url: 'https://github.com/innovacioncrecer/drone-ops-and-compliance/images/droneops-open-graph.png',
        width: 2000,
        height: 1000,
        type: 'image/png',
      },
    ],
    siteName: 'DroneOps and Communications',
  },
  icons: {
    icon: {
      rel: 'icon',
      url: '/favicon.ico',
    },
    apple: [
      {
        rel: 'apple-touch-icon',
        url: '/images/livekit-apple-touch.png',
        sizes: '180x180',
      },
      { rel: 'mask-icon', url: '/images/livekit-safari-pinned-tab.svg', color: '#070707' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#070707',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body data-lk-theme="default">
        <Toaster />
        {children}
      </body>
    </html>
  );
}
