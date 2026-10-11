import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import prisma from './prisma';
import { Recording, RecordingTranscript, recordingWindow } from './recordings';

export async function loadRecordingTranscript(recording: Recording, duration?: number) {
  const endedAt = duration && recording.startedAt
    ? new Date(Date.parse(recording.startedAt) + duration * 1000).toISOString()
    : recording.endedAt;
  const interval = recordingWindow({ ...recording, endedAt });
  if (!interval || recording.roomName === 'bucket-digitalocean' || recording.roomName === 'sin-sala') {
    return { entries: [], message: 'No se pudo identificar el horario o la sala de esta grabación.' };
  }

  if (process.env.DATABASE_URL) {
    const rows = await prisma.transcript.findMany({
      where: { salaId: recording.roomName, creadoEn: { gte: interval.start, lte: interval.end } },
      select: { id: true, hablante: true, texto: true, creadoEn: true, usuario: { select: { nombre: true } } },
      orderBy: { creadoEn: 'asc' },
      take: 10000,
    });
    if (rows.length) {
      return { entries: rows.map((row) => ({
        id: row.id,
        speaker: row.hablante === 'DOCO' ? 'DOCO' : row.usuario?.nombre ?? 'Participante',
        text: row.texto,
        createdAt: row.creadoEn.toISOString(),
      })) };
    }
  }

  const directory = process.env.TRANSCRIPTS_DIR ?? join(process.cwd(), 'agent', 'transcripts');
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { entries: [], message: 'Sin transcripción disponible para esta grabación.' };
    }
    throw error;
  }
  const entries: RecordingTranscript[] = [];
  for (const file of files.filter((name) => name.endsWith('.jsonl'))) {
    const content = await readFile(join(directory, file), 'utf8');
    for (const [index, line] of content.split('\n').entries()) {
      if (!line.trim()) continue;
      let row: Record<string, unknown>;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (!row || row.roomName !== recording.roomName || typeof row.createdAt !== 'string' ||
        typeof row.text !== 'string' || typeof row.speaker !== 'string') continue;
      const timestamp = Date.parse(row.createdAt);
      if (timestamp >= interval.start.getTime() && timestamp <= interval.end.getTime()) {
        entries.push({ id: `${file}:${index}`, text: row.text, speaker: row.speaker, createdAt: row.createdAt });
      }
    }
  }
  entries.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  return { entries, message: entries.length ? undefined : 'Sin transcripción disponible para esta grabación.' };
}