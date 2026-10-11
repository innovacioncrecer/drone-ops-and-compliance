import { ImageResponse } from 'next/og';

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: value } = await params;
  if (!['180', '192', '512'].includes(value)) return new Response(null, { status: 404 });
  const size = Number(value);
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#101214', color: '#83e1c5',
      fontSize: size * 0.36, fontWeight: 700 }}>DO</div>,
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}