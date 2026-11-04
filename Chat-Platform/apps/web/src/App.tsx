import { useEffect, useState } from 'react';
import { AUTH_EXPIRED_EVENT } from './lib/api';
import { connectSocket, disconnectSocket } from './lib/socket';
import { queryClient } from './lib/queryClient';
import { useAppStore } from './store/useAppStore';
import Landing from './components/Landing';
import AuthPage from './components/AuthPage';
import Shell from './components/Shell';
import { Toasts } from './components/Toasts';

export default function App() {
  const token = useAppStore((s) => s.token);
  const user = useAppStore((s) => s.user);
  const clearAuth = useAppStore((s) => s.clearAuth);
  const [showAuth, setShowAuth] = useState(() => new URLSearchParams(window.location.search).has('invite'));

  // The socket follows the session: connect when a token appears, close when it goes away.
  useEffect(() => {
    if (token) connectSocket(token);
    else disconnectSocket();
  }, [token]);

  // Any 401 from the API means the session is dead.
  useEffect(() => {
    const onExpired = () => {
      queryClient.clear();
      clearAuth();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [clearAuth]);

  return (
    <>
      {token && user ? <Shell /> : showAuth ? <AuthPage onBackToLanding={() => setShowAuth(false)} /> : <Landing onLaunch={() => setShowAuth(true)} />}
      <Toasts />
    </>
  );
}
