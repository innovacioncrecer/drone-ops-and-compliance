import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionState, Room, RoomEvent } from 'livekit-client';
import { attachCallAudioSession } from './callAudioSession';

function setup(supported = true) {
  const actions = new Map<string, (() => void) | null>();
  const mediaSession = {
    metadata: null,
    playbackState: 'none',
    setMicrophoneActive: vi.fn(),
    setActionHandler: vi.fn((action: string, handler: (() => void) | null) => {
      actions.set(action, handler);
    }),
  };
  const audioSession = { type: 'auto' };
  vi.stubGlobal('navigator', supported ? { audioSession, mediaSession } : {});
  vi.stubGlobal('MediaMetadata', class { constructor(public data: unknown) {} });
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', new EventTarget());
  const room = Object.assign(new EventEmitter(), {
    state: ConnectionState.Connected,
    canPlaybackAudio: false,
    localParticipant: {
      isMicrophoneEnabled: false,
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    },
    startAudio: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  });
  return { room, page, audioSession, mediaSession, actions, attach: () => attachCallAudioSession(room as unknown as Room) };
}

afterEach(() => vi.unstubAllGlobals());

describe('call audio session', () => {
  it('activates communication audio only while connected and restores it on cleanup', () => {
    const { room, audioSession, mediaSession, actions, attach } = setup();
    room.state = ConnectionState.Connecting;
    const cleanup = attach();
    expect(audioSession.type).toBe('auto');
    room.state = ConnectionState.Connected;
    room.emit(RoomEvent.Connected);
    expect(audioSession.type).toBe('play-and-record');
    expect(mediaSession.playbackState).toBe('playing');
    expect(mediaSession.setMicrophoneActive).toHaveBeenLastCalledWith(false);
    cleanup();
    expect(audioSession.type).toBe('auto');
    expect(mediaSession.playbackState).toBe('none');
    expect(mediaSession.metadata).toBeNull();
    expect(actions.get('togglemicrophone')).toBeNull();
    expect(room.eventNames()).toEqual([]);
  });

  it('does not unmute the microphone when hiding or resuming the page', () => {
    const { room, page, attach } = setup();
    const cleanup = attach();
    page.visibilityState = 'hidden';
    page.dispatchEvent(new Event('visibilitychange'));
    expect(room.startAudio).not.toHaveBeenCalled();
    page.visibilityState = 'visible';
    page.dispatchEvent(new Event('visibilitychange'));
    expect(room.startAudio).toHaveBeenCalledTimes(1);
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    cleanup();
    page.dispatchEvent(new Event('visibilitychange'));
    expect(room.startAudio).toHaveBeenCalledTimes(1);
  });

  it('supports explicit microphone and hangup actions and tracks mute changes', () => {
    const { room, actions, mediaSession, attach } = setup();
    const cleanup = attach();
    actions.get('togglemicrophone')?.();
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    room.localParticipant.isMicrophoneEnabled = true;
    room.emit(RoomEvent.TrackUnmuted);
    expect(mediaSession.setMicrophoneActive).toHaveBeenLastCalledWith(true);
    actions.get('togglemicrophone')?.();
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    actions.get('hangup')?.();
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    room.state = ConnectionState.Disconnected;
    room.emit(RoomEvent.Disconnected);
    expect(mediaSession.playbackState).toBe('none');
    cleanup();
  });

  it('works without experimental browser APIs', () => {
    const { attach } = setup(false);
    expect(() => attach()()).not.toThrow();
  });

  it('tolerates unsupported actions and rejected audio playback', async () => {
    const { room, page, mediaSession, attach } = setup();
    mediaSession.setActionHandler.mockImplementation(() => { throw new Error('Unsupported'); });
    room.startAudio.mockRejectedValue(new Error('Gesture required'));
    const cleanup = attach();
    page.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    expect(room.startAudio).toHaveBeenCalledTimes(1);
    cleanup();
  });
});