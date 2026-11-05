import { useState } from 'react';
import { Api, errorMessage } from '../lib/api';
import { useAppStore } from '../store/useAppStore';

const field = 'mt-2 w-full rounded bg-[#1a1d21] p-2.5 text-sm text-gray-200 border border-transparent outline-none focus:border-indigo-500 transition';
const label = 'block text-xs font-bold uppercase tracking-wider text-gray-400';
const link = 'ml-1 border-none bg-transparent p-0 text-xs font-medium text-indigo-400 hover:underline';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

interface Props {
  onBackToLanding: () => void;
  /** Present when the user followed a password-reset link (?reset=TOKEN). */
  resetToken?: string | null;
  onResetDone?: () => void;
}

const TITLES: Record<Mode, [string, string]> = {
  login: ['Welcome back!', "We're so excited to see you again!"],
  register: ['Create an account', 'Join your team today'],
  forgot: ['Forgot your password?', "Enter your email and we'll send you a reset link."],
  reset: ['Choose a new password', 'You will be signed out everywhere else.'],
};

export default function AuthPage({ onBackToLanding, resetToken, onResetDone }: Props) {
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const setAuth = useAppStore((s) => s.setAuth);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError('');
    setNotice('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'forgot') {
        await Api.forgotPassword(email);
        setNotice('If that email has an account, a reset link is on its way. Check your inbox.');
      } else if (mode === 'reset') {
        await Api.resetPassword(resetToken!, password);
        setPassword('');
        useAppStore.getState().toast('Password updated — please log in.', 'success');
        onResetDone?.();
        setMode('login');
      } else {
        const res = mode === 'login' ? await Api.login({ email, password }) : await Api.register({ name, email, password });
        setAuth(res.token, res.refreshToken, res.user); // App reacts to the token: connects the socket and renders the shell
      }
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong'));
    } finally {
      setLoading(false);
    }
  };

  const [title, subtitle] = TITLES[mode];
  const submitLabel = { login: 'Log In', register: 'Create account', forgot: 'Send reset link', reset: 'Update password' }[mode];

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-[#1a1d21] px-4">
      <div className="absolute left-1/2 top-1/4 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[128px]" />
      <button onClick={onBackToLanding} className="absolute left-6 top-6 text-sm text-gray-400 transition hover:text-white">&larr; Back to Home</button>

      <div className="z-10 w-full max-w-[480px] rounded-lg border border-gray-800 bg-[#22252a] p-8 shadow-2xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
          <p className="mt-1.5 text-sm text-gray-400">{subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <div role="alert" className="rounded border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-medium text-rose-400">{error}</div>}
          {notice && <div role="status" className="rounded border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-300">{notice}</div>}

          {mode === 'register' && (
            <div>
              <label htmlFor="name" className={label}>Display name</label>
              <input id="name" type="text" required minLength={2} maxLength={50} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
            </div>
          )}
          {mode !== 'reset' && (
            <div>
              <label htmlFor="email" className={label}>Email</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
            </div>
          )}
          {mode !== 'forgot' && (
            <div>
              <label htmlFor="password" className={label}>{mode === 'reset' ? 'New password' : 'Password'}</label>
              <input id="password" type="password" required minLength={mode === 'login' ? 1 : 8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
              {mode !== 'login' && <p className="mt-1 text-[11px] text-gray-500">At least 8 characters.</p>}
              {mode === 'login' && (
                <button type="button" onClick={() => switchTo('forgot')} className="mt-2 border-none bg-transparent p-0 text-xs text-indigo-400 hover:underline">Forgot your password?</button>
              )}
            </div>
          )}

          <button type="submit" disabled={loading} className="mt-2 w-full rounded bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50">
            {loading ? 'Please wait…' : submitLabel}
          </button>
        </form>

        <p className="mt-4 text-left text-xs text-gray-400">
          {mode === 'login' && <>Need an account?<button type="button" onClick={() => switchTo('register')} className={link}>Register</button></>}
          {mode === 'register' && <>Already have an account?<button type="button" onClick={() => switchTo('login')} className={link}>Log in</button></>}
          {(mode === 'forgot' || mode === 'reset') && <>Remembered it?<button type="button" onClick={() => switchTo('login')} className={link}>Back to log in</button></>}
        </p>
      </div>
    </div>
  );
}
