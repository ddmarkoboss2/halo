import { useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../store';
import { Field, Spinner } from './ui';
import { HashIcon, HeartIcon, PhoneIcon, SparklesIcon, VolumeIcon } from './icons';

type Mode = 'login' | 'register';

export function AuthScreen() {
  const signIn = useApp((state) => state.signIn);
  const [mode, setMode] = useState<Mode>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const boot =
        mode === 'login'
          ? await api.login({ identifier, password })
          : await api.register({ email, username, password, displayName: displayName || undefined });
      signIn(boot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative z-10 flex h-full items-center justify-center p-6">
      <div className="panel grid w-full max-w-4xl grid-cols-1 overflow-hidden md:grid-cols-[1.05fr_1fr]">
        <div className="relative hidden flex-col justify-between gap-8 p-9 md:flex">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                'radial-gradient(120% 80% at 10% 0%, rgba(124,92,255,0.35), transparent 60%), radial-gradient(90% 70% at 90% 100%, rgba(34,211,238,0.28), transparent 60%)',
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-halo-400 via-halo-600 to-aqua-500 text-lg font-black text-white shadow-lg shadow-halo-600/40">
                H
              </span>
              <div>
                <p className="text-lg font-extrabold tracking-tight text-white">Halo</p>
                <p className="text-xs text-mist-400">Spaces, DMs and live calls</p>
              </div>
            </div>
            <h1 className="mt-8 text-[28px] font-extrabold leading-tight tracking-tight text-white">
              Where your people
              <br />
              hang out.
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-mist-300">
              Servers and channels, direct messages, rich markdown, reactions and real-time voice or video — all in one
              calm, glassy interface.
            </p>
          </div>
          <ul className="relative space-y-3 text-sm text-mist-200">
            {[
              { icon: <HashIcon size={16} />, text: 'Organised servers with text and voice channels' },
              { icon: <HeartIcon size={16} />, text: 'Friends, presence and private DMs' },
              { icon: <PhoneIcon size={16} />, text: 'Browser calls with screen sharing' },
              { icon: <VolumeIcon size={16} />, text: 'Live typing indicators and reactions' },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/5 text-halo-300">
                  {item.icon}
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-white/5 p-8 md:border-l md:border-t-0">
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-halo-400 to-aqua-500 font-black text-white">
              H
            </span>
            <p className="text-base font-extrabold text-white">Halo</p>
          </div>

          <div className="mb-6 flex rounded-2xl border border-white/8 bg-ink-950/50 p-1">
            {(['login', 'register'] as Mode[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  setError(null);
                }}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  mode === value ? 'bg-white/10 text-white shadow-inner' : 'text-mist-400 hover:text-mist-200'
                }`}
              >
                {value === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form className="space-y-4" onSubmit={submit}>
            {mode === 'login' ? (
              <Field label="Email or username">
                <input
                  className="input"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="yourname"
                  autoComplete="username"
                  required
                />
              </Field>
            ) : (
              <>
                <Field label="Email">
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Username" hint="a-z, 0-9, _ and .">
                    <input
                      className="input"
                      value={username}
                      onChange={(event) => setUsername(event.target.value.toLowerCase())}
                      maxLength={20}
                      placeholder="yourname"
                      autoComplete="nickname"
                      required
                    />
                  </Field>
                  <Field label="Display name">
                    <input
                      className="input"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Ava Chen"
                    />
                  </Field>
                </div>
              </>
            )}

            <Field label="Password" hint={mode === 'register' ? 'At least 8 characters' : undefined}>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </Field>

            {error && (
              <p className="rounded-xl border border-coral-400/30 bg-coral-400/10 px-3 py-2 text-xs font-medium text-coral-400">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary h-11 w-full" disabled={busy}>
              {busy ? <Spinner size={16} /> : <SparklesIcon size={16} />}
              {mode === 'login' ? 'Enter Halo' : 'Create my account'}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-white/6 bg-white/3 p-3 text-xs text-mist-400">
            <p className="font-semibold text-mist-200">New here?</p>
            <p className="mt-1">
              Create an account above — you will land in the public{' '}
              <span className="font-semibold text-mist-200">Halo HQ</span> space automatically, with a welcome DM
              waiting for you. Everything else is yours to build.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
