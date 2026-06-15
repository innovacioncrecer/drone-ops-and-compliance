'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React from 'react';
import toast from 'react-hot-toast';
import styles from './Login.module.css';

type AccessRole = 'admin' | 'operator';

const SALA_PRINCIPAL = process.env.NEXT_PUBLIC_ROOM_NAME ?? 'droneops-sala-principal';

const roleLabels: Record<AccessRole, string> = {
  admin: 'Administrador',
  operator: 'Operador',
};

export default function LoginPage() {
  return (
    <React.Suspense fallback={<main className={styles.login}>Cargando...</main>}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRole = searchParams.get('role') === 'admin' ? 'admin' : 'operator';
  const nextPath = safeNextPath(searchParams.get('next'), requestedRole);
  const [role, setRole] = React.useState<AccessRole>(requestedRole);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const submitLogin = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, role }),
        });

        if (!response.ok) throw new Error(await response.text());

        toast.success('Sesion iniciada.');
        router.replace(safeNextPath(nextPath, role));
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo iniciar sesion.');
      } finally {
        setSubmitting(false);
      }
    },
    [email, nextPath, password, role, router],
  );

  return (
    <main className={styles.login} data-lk-theme="default">
      <section className={styles.panel}>
        <Link className={styles.brand} href="/">
          <span>DO</span>
          <strong>DroneOps</strong>
        </Link>

        <div className={styles.header}>
          <p>Acceso seguro</p>
          <h1>Iniciar sesion</h1>
        </div>

        <form className={styles.form} onSubmit={submitLogin}>
          <div className={styles.roleSwitch} role="tablist" aria-label="Tipo de acceso">
            {(Object.keys(roleLabels) as AccessRole[]).map((item) => (
              <button
                aria-selected={role === item}
                className={role === item ? styles.activeRole : ''}
                key={item}
                onClick={() => setRole(item)}
                role="tab"
                type="button"
              >
                {roleLabels[item]}
              </button>
            ))}
          </div>

          <label>
            Correo
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label>
            Contrasena
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          <button className={styles.submit} disabled={submitting} type="submit">
            {submitting ? 'Validando...' : `Entrar como ${roleLabels[role]}`}
          </button>
        </form>
      </section>
    </main>
  );
}

function safeNextPath(value: string | null, role: AccessRole): string {
  const fallback = role === 'admin' ? '/admin' : `/rooms/${SALA_PRINCIPAL}`;

  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  if (role !== 'admin' && (value.startsWith('/admin') || value.startsWith('/api/admin'))) {
    return `/rooms/${SALA_PRINCIPAL}`;
  }

  return value;
}
