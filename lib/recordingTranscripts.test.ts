import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRecordingTranscript } from './recordingTranscripts';
import { Recording } from './recordings';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), readdir: vi.fn(), readFile: vi.fn() }));
vi.mock('./prisma', () => ({ default: { transcript: { findMany: mocks.findMany } } }));
vi.mock('node:fs/promises', () => ({ readdir: mocks.readdir, readFile: mocks.readFile }));

const recording: Recording = {
  id: 'test', roomName: 'sala-1', startedAt: '2026-10-09T12:00:00Z', endedAt: '2026-10-09T12:05:00Z',
  fileName: 'test.mp4', location: null, publicUrl: null, status: 'completado',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DATABASE_URL', 'test');
  mocks.findMany.mockResolvedValue([]);
  mocks.readdir.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe('recording transcript association', () => {
  it('queries only the matching room and recording interval', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'turn', hablante: 'USUARIO', texto: 'Prueba', creadoEn: new Date('2026-10-09T12:01:00Z'), usuario: { nombre: 'Operador' } }]);
    const result = await loadRecordingTranscript(recording);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      salaId: 'sala-1', creadoEn: { gte: new Date(recording.startedAt!), lte: new Date(recording.endedAt!) },
    } }));
    expect(result.entries[0].speaker).toBe('Operador');
    expect(mocks.readdir).not.toHaveBeenCalled();
  });

  it('reads structured DOCO turns but excludes other rooms, dates and partial writes', async () => {
    mocks.readdir.mockResolvedValue(['turns.jsonl', 'legacy.md']);
    const turn = { roomName: 'sala-1', speaker: 'DOCO', text: 'Verificado', createdAt: '2026-10-09T12:01:00Z' };
    mocks.readFile.mockResolvedValue([
      JSON.stringify(turn),
      JSON.stringify({ ...turn, roomName: 'sala-2' }),
      JSON.stringify({ ...turn, createdAt: '2026-10-08T12:01:00Z' }),
      '{partial',
    ].join('\n'));
    const result = await loadRecordingTranscript(recording);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].text).toBe('Verificado');
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
  });

  it('uses video duration to bound bucket recordings without an end timestamp', async () => {
    await loadRecordingTranscript({ ...recording, endedAt: null }, 90);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      salaId: 'sala-1', creadoEn: { gte: new Date(recording.startedAt!), lte: new Date('2026-10-09T12:01:30Z') },
    } }));
  });

  it('does not query without a known start and end', async () => {
    const result = await loadRecordingTranscript({ ...recording, startedAt: null });
    expect(result.entries).toEqual([]);
    expect(result.message).toBeTruthy();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('reports missing shared transcripts as unavailable', async () => {
    mocks.readdir.mockRejectedValue(Object.assign(new Error('Missing'), { code: 'ENOENT' }));
    const result = await loadRecordingTranscript(recording);
    expect(result.entries).toEqual([]);
    expect(result.message).toContain('Sin transcripción');
  });

  it('does not present database failures as an empty successful transcript', async () => {
    mocks.findMany.mockRejectedValue(new Error('Database unavailable'));
    await expect(loadRecordingTranscript(recording)).rejects.toThrow('Database unavailable');
  });
});