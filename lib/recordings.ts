export type Recording = {
  id: string;
  roomName: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  fileName: string | null;
  location: string | null;
  publicUrl: string | null;
};

export type RecordingTranscript = {
  id: string;
  speaker: string;
  text: string;
  createdAt: string;
};

export function recordingTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0' || value === BigInt(0)) return null;
  let milliseconds: number;
  if (typeof value === 'bigint' || typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    const epoch = Number(value);
    milliseconds = epoch >= 1e17 ? epoch / 1e6 : epoch >= 1e14 ? epoch / 1e3 : epoch >= 1e11 ? epoch : epoch * 1000;
  } else if (typeof value === 'string') {
    milliseconds = Date.parse(value);
  } else {
    return null;
  }
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function recordingFileDetails(key: string) {
  const name = key.split('/').pop() ?? key;
  const match = name.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)-(.+)\.mp4$/i);
  return { startedAt: match ? recordingTimestamp(match[1]) : null, roomName: match?.[2] ?? null };
}

export function groupRecordingsByDay(recordings: Recording[], timeZone?: string) {
  const formatter = new Intl.DateTimeFormat('es-DO', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone,
  });
  const sorted = [...recordings].sort((left, right) =>
    (Date.parse(right.startedAt ?? '') || 0) - (Date.parse(left.startedAt ?? '') || 0),
  );
  const groups = new Map<string, Recording[]>();
  for (const recording of sorted) {
    const timestamp = recordingTimestamp(recording.startedAt);
    const day = timestamp ? formatter.format(new Date(timestamp)) : 'Sin fecha';
    groups.set(day, [...(groups.get(day) ?? []), recording]);
  }
  return Array.from(groups, ([day, items]) => ({ day, recordings: items }));
}

export function recordingWindow(recording: Recording) {
  const start = recordingTimestamp(recording.startedAt);
  const end = recordingTimestamp(recording.endedAt);
  if (!start || !end || Date.parse(end) < Date.parse(start)) return null;
  return { start: new Date(start), end: new Date(end) };
}