'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import toast from 'react-hot-toast';
import styles from './Admin.module.css';

type AdminUserRole = 'administrador' | 'operador' | 'observador';
type AdminUserStatus = 'activo' | 'inactivo';

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  createdAt: string;
  updatedAt: string;
};

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

const emptyForm = {
  id: '',
  name: '',
  email: '',
  password: '',
  role: 'operador' as AdminUserRole,
  status: 'activo' as AdminUserStatus,
};

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [recordings, setRecordings] = React.useState<Recording[]>([]);
  const [activeTab, setActiveTab] = React.useState<'users' | 'recordings'>('users');
  const [userForm, setUserForm] = React.useState(emptyForm);
  const [roomFilter, setRoomFilter] = React.useState('');
  const [loadingUsers, setLoadingUsers] = React.useState(true);
  const [loadingRecordings, setLoadingRecordings] = React.useState(true);
  const [savingUser, setSavingUser] = React.useState(false);
  const [selectedRecording, setSelectedRecording] = React.useState<Recording | null>(null);

  const loadUsers = React.useCallback(async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as { users: AdminUser[] };
      setUsers(data.users);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar usuarios.');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadRecordings = React.useCallback(async () => {
    setLoadingRecordings(true);
    try {
      const url = new URL('/api/admin/recordings', window.location.origin);
      if (roomFilter.trim()) {
        url.searchParams.set('roomName', roomFilter.trim());
      }

      const response = await fetch(url.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as { recordings: Recording[] };
      setRecordings(data.recordings);
      setSelectedRecording((current) =>
        current ? data.recordings.find((recording) => recording.id === current.id) ?? current : null,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar grabaciones.');
    } finally {
      setLoadingRecordings(false);
    }
  }, [roomFilter]);

  React.useEffect(() => {
    loadUsers();
    loadRecordings();
  }, [loadUsers, loadRecordings]);

  const saveUser = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSavingUser(true);

      try {
        const response = await fetch('/api/admin/users', {
          method: userForm.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userForm),
        });

        if (!response.ok) throw new Error(await response.text());
        setUserForm(emptyForm);
        await loadUsers();
        toast.success(userForm.id ? 'Usuario actualizado.' : 'Usuario creado.');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo guardar el usuario.');
      } finally {
        setSavingUser(false);
      }
    },
    [loadUsers, userForm],
  );

  const editUser = React.useCallback((user: AdminUser) => {
    setUserForm({
      id: user.id,
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      status: user.status,
    });
  }, []);

  const deleteUser = React.useCallback(
    async (user: AdminUser) => {
      const confirmed = window.confirm(`Eliminar usuario ${user.name}?`);
      if (!confirmed) return;

      try {
        const response = await fetch(`/api/admin/users?id=${encodeURIComponent(user.id)}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error(await response.text());
        await loadUsers();
        toast.success('Usuario eliminado.');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el usuario.');
      }
    },
    [loadUsers],
  );

  const logout = React.useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
    router.refresh();
  }, [router]);

  const activeUsers = users.filter((user) => user.status === 'activo').length;
  const activeRecordings = recordings.filter((recording) =>
    ['iniciando', 'activo', 'finalizando'].includes(recording.status.toLowerCase()),
  ).length;

  const playRecording = React.useCallback((recording: Recording) => {
    if (!recording.publicUrl) {
      toast.error('Esta grabacion no tiene una URL reproducible.');
      return;
    }

    setSelectedRecording(recording);
    setActiveTab('recordings');
  }, []);

  return (
    <main className={styles.admin} data-lk-theme="default">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Administración</p>
          <h1>Centro de operaciones</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link className="lk-button" href="/">
            Volver
          </Link>
          <button className="lk-button" onClick={logout} type="button">
            Cerrar sesión
          </button>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Resumen">
        <div>
          <span>Usuarios</span>
          <strong>{users.length}</strong>
        </div>
        <div>
          <span>Activos</span>
          <strong>{activeUsers}</strong>
        </div>
        <div>
          <span>Grabaciones</span>
          <strong>{recordings.length}</strong>
        </div>
        <div>
          <span>En curso</span>
          <strong>{activeRecordings}</strong>
        </div>
      </section>

      <nav className={styles.tabs} aria-label="Secciones">
        <button
          className={activeTab === 'users' ? styles.activeTab : ''}
          onClick={() => setActiveTab('users')}
          type="button"
        >
          Usuarios
        </button>
        <button
          className={activeTab === 'recordings' ? styles.activeTab : ''}
          onClick={() => setActiveTab('recordings')}
          type="button"
        >
          Grabaciones
        </button>
      </nav>

      {activeTab === 'users' ? (
        <section className={styles.workspace}>
          <form className={styles.userForm} onSubmit={saveUser}>
            <h2>{userForm.id ? 'Editar usuario' : 'Nuevo usuario'}</h2>
            <label>
              Nombre
              <input
                required
                value={userForm.name}
                onChange={(event) => setUserForm({ ...userForm, name: event.target.value })}
              />
            </label>
            <label>
              Correo
              <input
                required
                type="email"
                value={userForm.email}
                onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
              />
            </label>
            <label>
              Contraseña{userForm.id ? ' (dejar vacío para no cambiar)' : ''}
              <input
                required={!userForm.id}
                type="password"
                autoComplete="new-password"
                minLength={8}
                placeholder={userForm.id ? 'Nueva contraseña (opcional)' : 'Mínimo 8 caracteres'}
                value={userForm.password}
                onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
              />
            </label>
            <label>
              Rol
              <select
                value={userForm.role}
                onChange={(event) =>
                  setUserForm({ ...userForm, role: event.target.value as AdminUserRole })
                }
              >
                <option value="administrador">Administrador</option>
                <option value="operador">Operador</option>
                <option value="observador">Observador</option>
              </select>
            </label>
            <label>
              Estado
              <select
                value={userForm.status}
                onChange={(event) =>
                  setUserForm({ ...userForm, status: event.target.value as AdminUserStatus })
                }
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </label>
            <div className={styles.formActions}>
              <button className="lk-button" disabled={savingUser} type="submit">
                {savingUser ? 'Guardando...' : userForm.id ? 'Actualizar' : 'Crear'}
              </button>
              {userForm.id ? (
                <button
                  className="lk-button"
                  onClick={() => setUserForm(emptyForm)}
                  type="button"
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>

          <div className={styles.tablePanel}>
            <div className={styles.tableHeader}>
              <h2>Usuarios</h2>
              <button className="lk-button" onClick={loadUsers} type="button">
                Actualizar
              </button>
            </div>
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Actualizado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={6}>Cargando usuarios...</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Sin usuarios registrados.</td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.name}</td>
                        <td>{user.email}</td>
                        <td>{labelRole(user.role)}</td>
                        <td>
                          <span className={statusClass(user.status)}>{labelStatus(user.status)}</span>
                        </td>
                        <td>{formatDate(user.updatedAt)}</td>
                        <td>
                          <div className={styles.rowActions}>
                            <button className="lk-button" onClick={() => editUser(user)} type="button">
                              Editar
                            </button>
                            <button
                              className="lk-button"
                              onClick={() => deleteUser(user)}
                              type="button"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <section className={styles.tablePanel}>
          <div className={styles.tableHeader}>
            <h2>Grabaciones</h2>
            <form className={styles.filterBar} onSubmit={(event) => event.preventDefault()}>
              <input
                placeholder="Sala"
                value={roomFilter}
                onChange={(event) => setRoomFilter(event.target.value)}
              />
              <button className="lk-button" onClick={loadRecordings} type="button">
                Actualizar
              </button>
            </form>
          </div>

          <div className={styles.playerPanel}>
            {selectedRecording?.publicUrl ? (
              <>
                <div className={styles.playerMeta}>
                  <div>
                    <span>Reproduciendo</span>
                    <strong>
                      {selectedRecording.fileName ??
                        selectedRecording.location ??
                        selectedRecording.roomName}
                    </strong>
                  </div>
                  <div className={styles.rowActions}>
                    <button className="lk-button" onClick={loadRecordings} type="button">
                      Renovar enlace
                    </button>
                    <a
                      className="lk-button"
                      href={selectedRecording.publicUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Abrir
                    </a>
                  </div>
                </div>
                <video
                  key={selectedRecording.publicUrl}
                  className={styles.videoPlayer}
                  controls
                  playsInline
                  preload="metadata"
                  src={selectedRecording.publicUrl}
                />
              </>
            ) : (
              <div className={styles.emptyPlayer}>
                Selecciona una grabacion para reproducirla.
              </div>
            )}
          </div>

          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th>Sala</th>
                  <th>Estado</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th>Archivo</th>
                  <th>Reproducir</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {loadingRecordings ? (
                  <tr>
                    <td colSpan={7}>Cargando grabaciones...</td>
                  </tr>
                ) : recordings.length === 0 ? (
                  <tr>
                    <td colSpan={7}>Sin grabaciones disponibles.</td>
                  </tr>
                ) : (
                  recordings.map((recording) => (
                    <tr key={recording.id}>
                      <td>{recording.roomName}</td>
                      <td>
                        <span className={recordingStatusClass(recording.status)}>
                          {recording.status}
                        </span>
                      </td>
                      <td>{formatDate(recording.startedAt)}</td>
                      <td>{formatDate(recording.endedAt)}</td>
                      <td>
                        {recording.publicUrl ? (
                          <a href={recording.publicUrl} rel="noreferrer" target="_blank">
                            {recording.fileName ?? recording.location ?? 'Abrir archivo'}
                          </a>
                        ) : (
                          recording.fileName ?? recording.location ?? 'No disponible'
                        )}
                      </td>
                      <td>
                        <button
                          className="lk-button"
                          disabled={!recording.publicUrl}
                          onClick={() => playRecording(recording)}
                          type="button"
                        >
                          Reproducir
                        </button>
                      </td>
                      <td className={styles.mono}>{recording.id}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function labelRole(role: AdminUserRole): string {
  if (role === 'administrador') return 'Administrador';
  if (role === 'observador') return 'Observador';
  return 'Operador';
}

function labelStatus(status: AdminUserStatus): string {
  return status === 'activo' ? 'Activo' : 'Inactivo';
}

function formatDate(value: string | null): string {
  if (!value) return 'No disponible';
  return new Intl.DateTimeFormat('es-DO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusClass(status: AdminUserStatus): string {
  return status === 'activo' ? styles.statusOk : styles.statusMuted;
}

function recordingStatusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (['activo', 'iniciando', 'finalizando'].includes(normalized)) return styles.statusLive;
  if (['completado'].includes(normalized)) return styles.statusOk;
  if (['fallido', 'abortado', 'limite alcanzado'].includes(normalized)) return styles.statusDanger;
  return styles.statusMuted;
}
