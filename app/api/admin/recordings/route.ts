import { createHash, createHmac } from 'node:crypto';
import { EgressClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Recording = {
  id: string;
  roomName: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  fileName: string | null;
  location: string | null;
  publicUrl: string | null;
};

type SpaceObject = {
  key: string;
  lastModified: string | null;
  size: number | null;
};

export async function GET(request: NextRequest) {
  try {
    const roomName = request.nextUrl.searchParams.get('roomName')?.trim();
    const [egressRecordings, bucketRecordings] = await Promise.all([
      listarGrabacionesLiveKit(roomName).catch((error) => {
        console.error('[Admin] No se pudieron cargar grabaciones desde LiveKit:', error);
        return [];
      }),
      listarGrabacionesDelBucket(roomName),
    ]);
    const recordingsById = new Map<string, Recording>();

    for (const recording of [...egressRecordings, ...bucketRecordings]) {
      recordingsById.set(recording.id, recording);
    }

    return NextResponse.json({
      recordings: Array.from(recordingsById.values()).sort((a, b) => {
        const timeA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
        const timeB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
        return timeB - timeA;
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron cargar grabaciones.';
    return new NextResponse(message, { status: 500 });
  }
}

async function listarGrabacionesLiveKit(roomName?: string): Promise<Recording[]> {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
  if (!LIVEKIT_URL) return [];

  const hostURL = new URL(LIVEKIT_URL);
  hostURL.protocol = 'https:';

  const egressClient = new EgressClient(hostURL.origin, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  const filters = roomName ? { roomName } : {};
  const [allEgresses, activeEgresses] = await Promise.all([
    egressClient.listEgress(filters),
    egressClient.listEgress({ ...filters, active: true }),
  ]);
  const egressesById = new Map<string, Record<string, any>>();

  for (const egress of [...allEgresses, ...activeEgresses]) {
    const record = egress as Record<string, any>;
    const id = textoOEmpty(record.egressId) || textoOEmpty(record.id) || crypto.randomUUID();
    egressesById.set(id, record);
  }

  return Array.from(egressesById.entries()).map(([id, egress]) => normalizarGrabacion(id, egress));
}

function normalizarGrabacion(id: string, egress: Record<string, any>): Recording {
  const fileResult = Array.isArray(egress.fileResults) ? egress.fileResults[0] : undefined;
  const startedAt = normalizarTimestamp(fileResult?.startedAt ?? egress.startedAt);
  const endedAt = normalizarTimestamp(fileResult?.endedAt ?? egress.endedAt);
  const fileName =
    textoOEmpty(fileResult?.filename) ||
    textoOEmpty(egress.file?.filepath) ||
    buscarPrimerValor(egress, ['filepath', 'filename']) ||
    null;
  const location =
    textoOEmpty(fileResult?.location) ||
    textoOEmpty(fileResult?.filepath) ||
    textoOEmpty(egress.file?.filepath) ||
    buscarPrimerValor(egress, ['location']) ||
    null;
  const storageKey = normalizarStorageKey(location ?? fileName);
  const publicUrl = crearUrlGrabacion(storageKey);

  return {
    id,
    roomName: textoOEmpty(egress.roomName) || 'sin-sala',
    status: estadoGrabacion(egress.status),
    startedAt,
    endedAt,
    fileName,
    location,
    publicUrl,
  };
}

async function listarGrabacionesDelBucket(roomName?: string): Promise<Recording[]> {
  if (!tieneConfiguracionS3()) return [];

  const prefix = normalizarPrefix(process.env.S3_RECORDINGS_PREFIX ?? 'Doco');
  const objects = await listarObjetosSpace(prefix);

  return objects
    .filter((object) => object.key.toLowerCase().endsWith('.mp4'))
    .filter((object) => !roomName || object.key.toLowerCase().includes(roomName.toLowerCase()))
    .map((object) => ({
      id: `space:${object.key}`,
      roomName: inferirSalaDesdeKey(object.key) ?? roomName ?? 'bucket-digitalocean',
      status: 'en bucket',
      startedAt: object.lastModified,
      endedAt: null,
      fileName: object.key.split('/').pop() ?? object.key,
      location: object.key,
      publicUrl: crearUrlGrabacion(object.key),
    }));
}

async function listarObjetosSpace(prefix: string): Promise<SpaceObject[]> {
  const objects: SpaceObject[] = [];
  let continuationToken: string | undefined;
  let pageCount = 0;

  do {
    const query: Record<string, string> = {
      'list-type': '2',
      'max-keys': '1000',
    };

    if (prefix) query.prefix = prefix;
    if (continuationToken) query['continuation-token'] = continuationToken;

    const response = await signedS3Request('/', query);
    if (!response.ok) {
      throw new Error(`DigitalOcean Spaces respondio HTTP ${response.status}`);
    }

    const xml = await response.text();
    objects.push(...parseListBucketResult(xml));
    continuationToken = extraerXml(xml, 'NextContinuationToken') ?? undefined;
    pageCount += 1;
  } while (continuationToken && pageCount < 10);

  return objects;
}

async function signedS3Request(pathname: string, query: Record<string, string>): Promise<Response> {
  const config = getS3Config();
  const url = new URL(`${config.bucketUrl}${pathname}`);

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const amzDate = formatAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex('');
  const canonicalQuery = canonicalQueryString(Object.fromEntries(url.searchParams.entries()));
  const canonicalHeaders = [
    `host:${url.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n');
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'GET',
    canonicalUri(pathname),
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = hmacHex(signingKey(config.secretKey, dateStamp, config.region), stringToSign);

  return fetch(url, {
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
  });
}

function parseListBucketResult(xml: string): SpaceObject[] {
  const matches = xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g);
  const objects: SpaceObject[] = [];

  for (const match of matches) {
    const content = match[1] ?? '';
    const key = extraerXml(content, 'Key');
    if (!key) continue;

    const lastModified = extraerXml(content, 'LastModified');
    const size = Number(extraerXml(content, 'Size'));

    objects.push({
      key,
      lastModified,
      size: Number.isFinite(size) ? size : null,
    });
  }

  return objects;
}

function estadoGrabacion(status: unknown): string {
  if (typeof status === 'string') return status;

  switch (status) {
    case 0:
      return 'iniciando';
    case 1:
      return 'activo';
    case 2:
      return 'finalizando';
    case 3:
      return 'completado';
    case 4:
      return 'fallido';
    case 5:
      return 'abortado';
    case 6:
      return 'limite alcanzado';
    default:
      return 'desconocido';
  }
}

function normalizarTimestamp(value: unknown): string | null {
  if (value === undefined || value === null || value === 0 || value === '0') return null;

  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) {
      return fromEpoch(Number(value));
    }
    return value;
  }

  if (typeof value === 'number') {
    return fromEpoch(value);
  }

  if (typeof value === 'bigint') {
    return fromEpoch(Number(value));
  }

  return null;
}

function fromEpoch(value: number): string {
  const millis = value > 10_000_000_000 ? value : value * 1000;
  return new Date(millis).toISOString();
}

function textoOEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extraerXml(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1] ? decodeXml(match[1]) : null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function buscarPrimerValor(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null;

  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const candidate of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const result = buscarPrimerValor(item, keys);
        if (result) return result;
      }
      continue;
    }

    if (candidate && typeof candidate === 'object') {
      const result = buscarPrimerValor(candidate, keys);
      if (result) return result;
    }
  }

  return null;
}

function normalizarStorageKey(value: string | null): string | null {
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) return value;

  if (value.startsWith('s3://')) {
    const withoutProtocol = value.slice('s3://'.length);
    const slashIndex = withoutProtocol.indexOf('/');
    return slashIndex === -1 ? null : withoutProtocol.slice(slashIndex + 1);
  }

  return value.replace(/^\/+/, '');
}

function normalizarPrefix(prefix: string): string {
  const normalized = prefix.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `${normalized}/` : '';
}

function crearUrlGrabacion(storageKey: string | null): string | null {
  if (!storageKey) return null;
  if (/^https?:\/\//i.test(storageKey)) return storageKey;

  if (tieneConfiguracionS3()) {
    return crearUrlFirmadaLectura(storageKey, 60 * 60);
  }

  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  if (publicBaseUrl) {
    return `${publicBaseUrl}/${encodeStoragePath(storageKey)}`;
  }

  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !bucket) return null;

  const endpointUrl = new URL(endpoint);
  return `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}/${encodeStoragePath(storageKey)}`;
}

function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function crearUrlFirmadaLectura(storageKey: string, expiresSeconds: number): string {
  const config = getS3Config();
  const key = normalizarStorageKey(storageKey) ?? storageKey;
  const pathname = `/${encodeStoragePath(key)}`;
  const url = new URL(`${config.bucketUrl}${pathname}`);
  const amzDate = formatAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = canonicalQueryString(query);
  const canonicalRequest = [
    'GET',
    pathname,
    canonicalQuery,
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = hmacHex(signingKey(config.secretKey, dateStamp, config.region), stringToSign);

  for (const [keyName, value] of Object.entries(query)) {
    url.searchParams.set(keyName, value);
  }
  url.searchParams.set('X-Amz-Signature', signature);

  return url.toString();
}

function tieneConfiguracionS3(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_REGION &&
      process.env.S3_KEY_ID &&
      process.env.S3_KEY_SECRET,
  );
}

function getS3Config(): {
  accessKey: string;
  secretKey: string;
  region: string;
  bucketUrl: string;
} {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  const accessKey = process.env.S3_KEY_ID;
  const secretKey = process.env.S3_KEY_SECRET;

  if (!endpoint || !bucket || !region || !accessKey || !secretKey) {
    throw new Error('Faltan variables S3 para listar grabaciones del bucket.');
  }

  const endpointUrl = new URL(endpoint);
  return {
    accessKey,
    secretKey,
    region,
    bucketUrl: `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}`,
  };
}

function inferirSalaDesdeKey(key: string): string | null {
  const fileName = key.split('/').pop() ?? key;
  const match = fileName.match(/^\d{4}-\d{2}-\d{2}T.+?-(.+)\.mp4$/i);
  return match?.[1] ?? null;
}

function canonicalQueryString(query: Record<string, string>): string {
  return Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
}

function canonicalUri(pathname: string): string {
  return pathname
    .split('/')
    .map((part) => encodeRfc3986(decodeURIComponent(part)))
    .join('/');
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function signingKey(secretKey: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
