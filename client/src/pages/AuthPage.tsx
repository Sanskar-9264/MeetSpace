import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col justify-between bg-cobalt p-8 text-white lg:p-14">
        <span className="font-display text-xl font-bold">Meetspace</span>
        <div className="my-16 max-w-xl">
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
            Talk it through, sketch it out, hand over the file.
          </h1>
          <p className="mt-5 max-w-md text-lg text-white/80">
            Video calls with a shared whiteboard, screen sharing and encrypted file transfer, all in one room.
          </p>
        </div>
        <p className="text-sm text-white/70">Calls are encrypted end to end between browsers. Shared files are encrypted at rest.</p>
      </section>

      <section className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <h2 className="font-display text-2xl font-bold">{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>

          {mode === 'register' && (
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium">Name</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
            {mode === 'register' && <p className="mt-1.5 text-xs text-ink/60">At least 8 characters.</p>}
          </div>

          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <p className="text-center text-sm text-ink/70">
            {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
            <button
              type="button"
              className="font-semibold text-cobalt hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>
      </section>
    </div>
  );
}
