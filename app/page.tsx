'use client';

import { useRouter } from 'next/navigation';
import React from 'react';
import styles from '../styles/Home.module.css';

type AccessRole = 'admin' | 'operator';

const SALA_PRINCIPAL = process.env.NEXT_PUBLIC_ROOM_NAME ?? 'droneops-sala-principal';

const roleCopy: Record<
  AccessRole,
  {
    label: string;
    title: string;
    description: string;
    action: string;
  }
> = {
  admin: {
    label: 'Administrador',
    title: 'Gestionar plataforma',
    description: 'Usuarios, grabaciones, sesiones y evidencias operativas centralizadas.',
    action: 'Entrar a administración',
  },
  operator: {
    label: 'Operador',
    title: 'Entrar a operación',
    description: 'Sala en vivo con DOCO, comunicaciones de equipo y registro de misión.',
    action: 'Entrar a sala',
  },
};

export default function Page() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = React.useState<AccessRole>('operator');

  const routeForRole = React.useCallback(
    (role: AccessRole) => (role === 'admin' ? '/admin' : `/rooms/${SALA_PRINCIPAL}`),
    [],
  );

  const loginRouteForRole = React.useCallback(
    (role: AccessRole) =>
      `/login?role=${role}&next=${encodeURIComponent(routeForRole(role))}`,
    [routeForRole],
  );

  const startSession = React.useCallback(() => {
    router.push(loginRouteForRole(selectedRole));
  }, [loginRouteForRole, router, selectedRole]);

  const openRole = React.useCallback(
    (role: AccessRole) => {
      setSelectedRole(role);
      router.push(loginRouteForRole(role));
    },
    [loginRouteForRole, router],
  );

  return (
    <main className={styles.main} data-lk-theme="default">
      <section className={styles.hero}>
        <nav className={styles.nav} aria-label="Principal">
          <a className={styles.brand} href="#inicio" aria-label="DroneOps and Communications">
            <span className={styles.brandMark}>DO</span>
            <span>
              <strong>DroneOps</strong>
              <small>Command & Communications</small>
            </span>
          </a>

          <div className={styles.navLinks}>
            <a href="#plataforma">Plataforma</a>
            <a href="#operacion">Operación</a>
            <a href="#seguridad">Seguridad</a>
          </div>

          <button className={styles.loginButton} onClick={startSession} type="button">
            Iniciar sesión
          </button>
        </nav>

        <div className={styles.heroGrid} id="inicio">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Centro operativo asistido por DOCO</p>
            <h1>DroneOps and Communications</h1>
            <p>
              Plataforma para coordinar reuniones operativas, asistencia por voz, grabaciones,
              transcripciones y gestión de equipos en misiones de campo.
            </p>
          </div>

          <aside className={styles.accessPanel} aria-label="Acceso por rol">
            <span className={styles.panelLabel}>Selecciona tu perfil</span>
            <div className={styles.roleSwitch} role="tablist" aria-label="Tipo de acceso">
              {(Object.keys(roleCopy) as AccessRole[]).map((role) => (
                <button
                  aria-selected={selectedRole === role}
                  className={selectedRole === role ? styles.activeRole : ''}
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  role="tab"
                  type="button"
                >
                  {roleCopy[role].label}
                </button>
              ))}
            </div>

            <div className={styles.roleSummary}>
              <h2>{roleCopy[selectedRole].title}</h2>
              <p>{roleCopy[selectedRole].description}</p>
            </div>

            <button className={styles.primaryAction} onClick={startSession} type="button">
              {roleCopy[selectedRole].action}
            </button>
          </aside>
        </div>
      </section>

      <section className={styles.statusBand} aria-label="Estado de plataforma">
        <div>
          <span>Asistente</span>
          <strong>DOCO</strong>
        </div>
        <div>
          <span>Grabaciones</span>
          <strong>DigitalOcean Spaces</strong>
        </div>
        <div>
          <span>Clima operativo</span>
          <strong>METAR / TAF</strong>
        </div>
        <div>
          <span>Transcripción</span>
          <strong>Por participante</strong>
        </div>
      </section>

      <section className={styles.contentSection} id="plataforma">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Plataforma</p>
          <h2>Diseñada para reuniones que no pueden perder contexto.</h2>
        </div>
        <div className={styles.featureGrid}>
          <article>
            <span>01</span>
            <h3>Coordinación en vivo</h3>
            <p>Salas de operación con audio, video, control de grabación y entrada manual de DOCO.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Memoria operacional</h3>
            <p>Transcripciones organizadas por turno y participante para revisar decisiones clave.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Archivo centralizado</h3>
            <p>Grabaciones separadas en el bucket bajo el prefijo DOCO y reproducibles desde admin.</p>
          </article>
        </div>
      </section>

      <section className={styles.opsSection} id="operacion">
        <div className={styles.commandVisual} aria-hidden="true">
          <div className={styles.mapPane}>
            <span className={styles.routeLine} />
            <span className={styles.waypointA} />
            <span className={styles.waypointB} />
            <span className={styles.waypointC} />
          </div>
          <div className={styles.telemetryPane}>
            <span>DOCO activo</span>
            <strong>Operación lista</strong>
            <small>Santo Domingo · MDJB · Sala principal</small>
          </div>
        </div>

        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Operación</p>
          <h2>Acceso rápido según responsabilidad.</h2>
          <p>
            Los administradores gestionan usuarios y evidencia. Los operadores entran directo a la
            sala para coordinar con el equipo y consultar a DOCO.
          </p>
          <div className={styles.roleCards}>
            <button onClick={() => openRole('admin')} type="button">
              <span>Administrador</span>
              <strong>Usuarios y grabaciones</strong>
            </button>
            <button onClick={() => openRole('operator')} type="button">
              <span>Operador</span>
              <strong>Sala de misión</strong>
            </button>
          </div>
        </div>
      </section>

      <section className={styles.contentSection} id="seguridad">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Seguridad y control</p>
          <h2>Una base clara para crecer hacia autenticación completa.</h2>
        </div>
        <div className={styles.featureGrid}>
          <article>
            <span>Roles</span>
            <h3>Separación de acceso</h3>
            <p>La experiencia diferencia administración y operación desde la entrada principal.</p>
          </article>
          <article>
            <span>Datos</span>
            <h3>Registro auditable</h3>
            <p>Grabaciones y transcripciones quedan disponibles para consulta posterior.</p>
          </article>
          <article>
            <span>Equipo</span>
            <h3>Comunicación con todos</h3>
            <p>DOCO puede integrarse a la sala para asistir a los participantes conectados.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
