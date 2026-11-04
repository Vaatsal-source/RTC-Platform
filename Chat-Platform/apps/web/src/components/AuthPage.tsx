import { useState } from 'react';
import { Api, errorMessage } from '../lib/api';
import { useAppStore } from '../store/useAppStore';

const field = 'mt-2 w-full rounded bg-[#1a1d21] p-2.5 text-sm text-gray-200 border border-transparent outline-none focus:border-indigo-500 transition';
const label = 'block text-xs font-bold uppercase tracking-wider text-gray-400';

export default function AuthPage({ onBackToLanding }: { onBackToLanding: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setAuth = useAppStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = isLogin ? await Api.login({ email, password }) : await Api.register({ name, email, password });
      setAuth(res.token, res.user); // App reacts to the token: connects the socket and renders the shell
    } catch (err) {
      setError(errorMessage(err, 'Authentication failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-[#1a1d21] px-4">
      <div className="absolute left-1/2 top-1/4 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[128px]" />
      <button onClick={onBackToLanding} className="absolute left-6 top-6 text-sm text-gray-400 transition hover:text-white">&larr; Back to Home</button>

      <div className="z-10 w-full max-w-[480px] rounded-lg border border-gray-800 bg-[#22252a] p-8 shadow-2xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white">{isLogin ? 'Welcome back!' : 'Create an account'}</h2>
          <p className="mt-1.5 text-sm text-gray-400">{isLogin ? "We're so excited to see you again!" : 'Join your team today'}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <div role="alert" className="rounded border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-medium text-rose-400">{error}</div>}

          {!isLogin && (
            <div>
              <label htmlFor="name" className={label}>Display name</label>
              <input id="name" type="text" required minLength={2} maxLength={50} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
            </div>
          )}
          <div>
            <label htmlFor="email" className={label}>Email</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="password" className={label}>Password</label>
            <input id="password" type="password" required minLength={isLogin ? 1 : 8} autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            {!isLogin && <p className="mt-1 text-[11px] text-gray-500">At least 8 characters.</p>}
          </div>

          <button type="submit" disabled={loading} className="mt-2 w-full rounded bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50">
            {loading ? 'Please wait…' : isLogin ? 'Log In' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-left text-xs text-gray-400">
          {isLogin ? 'Need an account?' : 'Already have an account?'}
          <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }} className="ml-1 border-none bg-transparent p-0 text-xs font-medium text-indigo-400 hover:underline">{isLogin ? 'Register' : 'Log in'}</button>
        </p>
      </div>
    </div>
  );
}
