import { describe, expect, it } from 'vitest';
import { groupRecordingsByDay, Recording, recordingFileDetails, recordingTimestamp, recordingWindow } from './recordings';

const recording = (id: string, startedAt: string | null): Recording => ({
  id, startedAt, endedAt: null, roomName: 'sala', status: 'completado',
  fileName: null, location: null, publicUrl: null,
});

describe('recording dates and grouping', () => {
  it('groups by local calendar day newest first, not by UTC day', () => {
    const groups = groupRecordingsByDay([
      recording('old', '2026-10-08T10:00:00Z'),
      recording('late', '2026-10-10T02:00:00Z'),
      recording('early', '2026-10-09T12:00:00Z'),
      recording('unknown', null),
    ], 'America/Santo_Domingo');
    expect(groups.map((group) => group.recordings.map((item) => item.id))).toEqual([
      ['late', 'early'], ['old'], ['unknown'],
    ]);
    expect(groups[2].day).toBe('Sin fecha');
  });

  it('normalizes LiveKit nanoseconds as well as milliseconds and seconds', () => {
    const milliseconds = Date.parse('2026-10-09T12:00:00Z');
    for (const value of [milliseconds, milliseconds / 1000, BigInt(milliseconds) * BigInt(1000000)]) {
      expect(recordingTimestamp(value)).toBe('2026-10-09T12:00:00.000Z');
    }
    expect(recordingTimestamp('invalid')).toBeNull();
    expect(recordingTimestamp(BigInt(0))).toBeNull();
  });

  it('extracts the exact room and start from the existing recording filename format', () => {
    expect(recordingFileDetails('Doco/2026-10-09T12:30:00.123Z-sala-principal.mp4')).toEqual({
      startedAt: '2026-10-09T12:30:00.123Z', roomName: 'sala-principal',
    });
    expect(recordingFileDetails('unknown.mp4').roomName).toBeNull();
  });

  it('does not associate transcripts without a bounded recording interval', () => {
    const item = recording('test', '2026-10-09T12:00:00Z');
    expect(recordingWindow(item)).toBeNull();
    expect(recordingWindow({ ...item, endedAt: '2026-10-08T12:00:00Z' })).toBeNull();
    expect(recordingWindow({ ...item, endedAt: '2026-10-09T13:00:00Z' })).toEqual({
      start: new Date('2026-10-09T12:00:00Z'), end: new Date('2026-10-09T13:00:00Z'),
    });
  });
});