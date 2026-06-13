import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

interface AuthPageProps {
  onBackToLanding: () => void;
  onSuccess: () => void;
}

export default function AuthPage({ onBackToLanding, onSuccess }: AuthPageProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Simulated login/register action until we spin up apps/api
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Mocking JWT token issuance for frontend flow verification
      if (email && password) {
        localStorage.setItem('token', 'mock_jwt_token_payload');
        onSuccess();
      } else {
        throw new Error('Please fill in all credentials.');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-[#1a1d21] px-4 select-none">
      {/* Background abstract ambient glow */}
      <div className="absolute top-1/4 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[128px]" />

      {/* Back to Landing Link */}
      <button 
        onClick={onBackToLanding}
        className="absolute top-6 left-6 text-sm text-gray-400 hover:text-white transition"
      >
        &larr; Back to Home
      </button>

      {/* Dynamic Auth Card */}
      <div className="z-10 w-full max-w-[480px] rounded-lg border border-gray-800 bg-[#22252a] p-8 shadow-2xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {isLogin ? 'Welcome back!' : 'Create an account'}
          </h2>
          <p className="mt-1.5 text-sm text-gray-400">
            {isLogin ? "We're so excited to see you again!" : 'Join your engineering space today'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded bg-rose-500/10 p-3 text-xs font-medium text-rose-400 border border-rose-500/20">
              {error}
            </div>
          )}

          {!isLogin && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-2 w-full rounded bg-[#1a1d21] p-2.5 text-sm text-gray-200 border border-transparent outline-none focus:border-indigo-500 transition"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded bg-[#1a1d21] p-2.5 text-sm text-gray-200 border border-transparent outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded bg-[#1a1d21] p-2.5 text-sm text-gray-200 border border-transparent outline-none focus:border-indigo-500 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Processing...' : isLogin ? 'Log In' : 'Continue'}
          </button>
        </form>

        <div className="mt-4 text-left">
          <span className="text-xs text-gray-400">
            {isLogin ? 'Need an account? ' : 'Already have an account? '}
            <button
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="text-xs font-medium text-indigo-400 hover:underline inline ml-1 bg-transparent border-none p-0 cursor-pointer"
            >
              {isLogin ? 'Register' : 'Login'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}