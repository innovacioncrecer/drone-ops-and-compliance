'use client';

import React from 'react';
import { Film, Play, RefreshCw, Search, X } from 'lucide-react';
import { groupRecordingsByDay, Recording, RecordingTranscript } from '@/lib/recordings';
import styles from './RecordingGallery.module.css';

export function RecordingGallery(props: {
  recordings: Recording[];
  loading: boolean;
  refresh: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = props.recordings.find((recording) => recording.id === selectedId);
  const groups = groupRecordingsByDay(props.recordings);

  return (
    <>
      {props.loading ? <p role="status">Cargando grabaciones...</p> : groups.length === 0 ? (
        <p className={styles.empty}>Sin grabaciones disponibles.</p>
      ) : groups.map((group) => (
        <section className={styles.dayGroup} key={group.day} aria-label={group.day}>
          <header className={styles.dayHeading}>
            <h3>{group.day}</h3><span>{group.recordings.length} grabaciones</span>
          </header>
          <div className={styles.grid}>
            {group.recordings.map((recording) => (
              <button className={styles.card} key={recording.id} type="button"
                onClick={() => setSelectedId(recording.id)}
                aria-label={`Abrir grabación de ${recording.roomName}, ${formatTime(recording.startedAt)}`}>
                <RecordingThumbnail recording={recording} />
                <div className={styles.cardBody}>
                  <strong>{recording.roomName}</strong>
                  <div className={styles.cardMeta}>
                    <time dateTime={recording.startedAt ?? undefined}>{formatTime(recording.startedAt)}</time>
                    <span className={styles.status} data-status={recording.status}>{recording.status}</span>
                  </div>
                  <small title={recording.fileName ?? recording.id}>{recording.fileName ?? recording.id}</small>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
      {selected && <RecordingViewer key={selected.id} recording={selected}
        onClose={() => setSelectedId(null)} refresh={props.refresh} />}
    </>
  );
}

function RecordingThumbnail({ recording }: { recording: Recording }) {
  const container = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '100px' });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.thumbnail} ref={container}>
      <div className={styles.placeholder}><Film size={32} aria-hidden="true" />
        <span>{failed ? 'Vista previa no disponible' : !recording.publicUrl ? 'Archivo no disponible' : 'Grabación'}</span>
      </div>
      {visible && recording.publicUrl && !failed && (
        <video key={recording.publicUrl} src={recording.publicUrl} muted playsInline preload="metadata"
          aria-hidden="true" tabIndex={-1} className={loaded ? styles.previewReady : styles.preview}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(1, video.duration / 2);
          }}
          onSeeked={() => setLoaded(true)} onError={() => setFailed(true)} />
      )}
      <span className={styles.play}><Play size={22} fill="currentColor" aria-hidden="true" /></span>
    </div>
  );
}

function RecordingViewer({ recording, onClose, refresh }: {
  recording: Recording;
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const dialog = React.useRef<HTMLDialogElement>(null);
  const video = React.useRef<HTMLVideoElement>(null);
  const [entries, setEntries] = React.useState<RecordingTranscript[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [duration, setDuration] = React.useState<number>();
  const [currentTime, setCurrentTime] = React.useState(0);
  const [videoError, setVideoError] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const start = Date.parse(recording.startedAt ?? '');
  const activeIndex = entries.reduce((lastIndex, entry, index) =>
    Date.parse(entry.createdAt) <= start + currentTime * 1000 ? index : lastIndex, -1);
  const filtered = entries.filter((entry) => `${entry.speaker} ${entry.text}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));

  React.useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);

  React.useEffect(() => { setVideoError(false); }, [recording.publicUrl]);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const url = new URL('/api/admin/recordings', window.location.origin);
    url.searchParams.set('recordingId', recording.id);
    if (duration && !recording.endedAt) url.searchParams.set('duration', String(duration));
    void fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar la transcripción.');
        return response.json() as Promise<{ entries: RecordingTranscript[]; message?: string }>;
      })
      .then((data) => { setEntries(data.entries); setMessage(data.message ?? ''); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [recording.id, recording.endedAt, duration, attempt]);

  const renew = async () => {
    setRefreshing(true);
    try { await refresh(); setVideoError(false); video.current?.load(); }
    finally { setRefreshing(false); }
  };

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="recording-title"
      onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <header className={styles.viewerHeader}>
        <div><p>Grabación · {formatTime(recording.startedAt)}</p><h2 id="recording-title">{recording.roomName}</h2></div>
        <div className={styles.tools}>
          <button type="button" onClick={renew} disabled={refreshing} title="Renovar enlace" aria-label="Renovar enlace"><RefreshCw size={20} /></button>
          <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar grabación"><X size={22} /></button>
        </div>
      </header>
      <div className={styles.viewerBody}>
        <section className={styles.media} aria-label="Reproductor">
          {recording.publicUrl ? <video ref={video} src={recording.publicUrl} controls playsInline preload="metadata"
            onLoadedMetadata={(event) => {
              const value = event.currentTarget.duration;
              if (Number.isFinite(value) && value > 0) setDuration(value);
            }}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onError={() => setVideoError(true)} />
            : <p className={styles.empty}>Archivo de vídeo no disponible.</p>}
          {videoError && <p role="alert">No se pudo reproducir el vídeo. <button type="button" onClick={renew}>Renovar enlace</button></p>}
          <p className={styles.fileName}>{recording.fileName ?? recording.id}</p>
          <span className={styles.status}>{recording.status}</span>
        </section>
        <section className={styles.transcript} aria-label="Transcripción">
          <h3>Transcripción <span>{entries.length || ''}</span></h3>
          <label className={styles.search}><Search size={18} aria-hidden="true" />
            <input aria-label="Buscar en transcripción" placeholder="Buscar en transcripción" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className={styles.transcriptBody}>
            {loading ? <p role="status">Cargando transcripción...</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(attempt + 1)}>Reintentar</button></div>
              : entries.length === 0 ? <p>{message || 'Sin transcripción disponible.'}</p>
              : filtered.length === 0 ? <p>Sin coincidencias.</p>
              : filtered.map((entry) => {
                const offset = Math.max(0, (Date.parse(entry.createdAt) - start) / 1000);
                return <button type="button" className={styles.turn} key={entry.id}
                  aria-current={entries[activeIndex]?.id === entry.id ? 'true' : undefined}
                  disabled={!recording.publicUrl || !Number.isFinite(offset)}
                  onClick={() => { if (video.current) video.current.currentTime = offset; }}>
                  <span><strong>{entry.speaker}</strong><time>{elapsed(offset)}</time></span>
                  <p>{entry.text}</p>
                </button>;
              })}
          </div>
        </section>
      </div>
    </dialog>
  );
}

function formatTime(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('es-DO', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
    : 'Sin hora';
}

function elapsed(seconds: number) {
  if (!Number.isFinite(seconds)) return '--:--';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}