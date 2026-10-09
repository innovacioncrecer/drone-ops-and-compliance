import { ConnectionState, Room, RoomEvent } from 'livekit-client';

type AudioSessionNavigator = Navigator & {
  audioSession?: { type: string };
};

type CallMediaSession = MediaSession & {
  setMicrophoneActive?: (active: boolean) => void;
};

export function attachCallAudioSession(room: Room) {
  const audioSession = (navigator as AudioSessionNavigator).audioSession;
  const mediaSession = navigator.mediaSession as CallMediaSession | undefined;
  const previousAudioType = audioSession?.type;
  const previousMetadata = mediaSession?.metadata ?? null;
  const previousPlaybackState = mediaSession?.playbackState ?? 'none';
  const registeredActions: MediaSessionAction[] = [];
  let active = false;
  let disposed = false;

  const attempt = (operation: () => void) => {
    try {
      operation();
    } catch (error) {
      console.debug('Call audio integration unavailable', error);
    }
  };

  const syncMicrophone = () => {
    if (active) {
      attempt(() => mediaSession?.setMicrophoneActive?.(room.localParticipant.isMicrophoneEnabled));
    }
  };

  const registerAction = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
    if (!mediaSession) return;
    attempt(() => {
      mediaSession.setActionHandler(action, handler);
      registeredActions.push(action);
    });
  };

  const activate = () => {
    if (disposed || active || room.state !== ConnectionState.Connected) return;
    active = true;
    attempt(() => {
      if (audioSession) audioSession.type = 'play-and-record';
    });
    attempt(() => {
      if (mediaSession) {
        mediaSession.metadata = new MediaMetadata({ title: 'Llamada de DroneOps' });
        mediaSession.playbackState = 'playing';
      }
    });
    registerAction('togglemicrophone', () => {
      if (disposed || room.state !== ConnectionState.Connected) return;
      void room.localParticipant
        .setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled)
        .catch((error) => console.warn('Could not change call microphone', error));
    });
    registerAction('hangup', () => {
      if (!disposed) void room.disconnect();
    });
    syncMicrophone();
  };

  const deactivate = () => {
    if (!active) return;
    active = false;
    for (const action of registeredActions.splice(0)) {
      attempt(() => mediaSession?.setActionHandler(action, null));
    }
    attempt(() => mediaSession?.setMicrophoneActive?.(false));
    attempt(() => {
      if (mediaSession) {
        mediaSession.metadata = previousMetadata;
        mediaSession.playbackState = previousPlaybackState;
      }
    });
    attempt(() => {
      if (audioSession && previousAudioType !== undefined) audioSession.type = previousAudioType;
    });
  };

  const resumePlayback = () => {
    if (disposed || document.visibilityState !== 'visible' || room.state !== ConnectionState.Connected) {
      return;
    }
    if (!room.canPlaybackAudio) {
      void room.startAudio().catch((error) => console.debug('Call audio needs a user gesture', error));
    }
    syncMicrophone();
  };

  room.on(RoomEvent.Connected, activate);
  room.on(RoomEvent.Reconnected, resumePlayback);
  room.on(RoomEvent.Disconnected, deactivate);
  room.on(RoomEvent.TrackMuted, syncMicrophone);
  room.on(RoomEvent.TrackUnmuted, syncMicrophone);
  room.on(RoomEvent.LocalTrackPublished, syncMicrophone);
  room.on(RoomEvent.LocalTrackUnpublished, syncMicrophone);
  document.addEventListener('visibilitychange', resumePlayback);
  document.addEventListener('pointerdown', resumePlayback);
  window.addEventListener('pageshow', resumePlayback);
  activate();

  return () => {
    disposed = true;
    room.off(RoomEvent.Connected, activate);
    room.off(RoomEvent.Reconnected, resumePlayback);
    room.off(RoomEvent.Disconnected, deactivate);
    room.off(RoomEvent.TrackMuted, syncMicrophone);
    room.off(RoomEvent.TrackUnmuted, syncMicrophone);
    room.off(RoomEvent.LocalTrackPublished, syncMicrophone);
    room.off(RoomEvent.LocalTrackUnpublished, syncMicrophone);
    document.removeEventListener('visibilitychange', resumePlayback);
    document.removeEventListener('pointerdown', resumePlayback);
    window.removeEventListener('pageshow', resumePlayback);
    deactivate();
  };
}