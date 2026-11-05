import { useEffect, useState } from 'react';
import { AUTH_EXPIRED_EVENT, Api, TOKENS_REFRESHED_EVENT, errorMessage } from './lib/api';
import { TOKEN_KEY } from './lib/session';
import { connectSocket, disconnectSocket } from './lib/socket';
import { queryClient } from './lib/queryClient';
import { useAppStore } from './store/useAppStore';
import Landing from './components/Landing';
import AuthPage from './components/AuthPage';
import Shell from './components/Shell';
import { Toasts } from './components/Toasts';

const param = (name: string) => new URLSearchParams(window.location.search).get(name);
const cleanUrl = (...names: string[]) => {
  const q = new URLSearchParams(window.location.search);
  names.forEach((n) => q.delete(n));
  const rest = q.toString();
  window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
};

export default function App() {
  const token = useAppStore((s) => s.token);
  const user = useAppStore((s) => s.user);
  const clearAuth = useAppStore((s) => s.clearAuth);
  const [showAuth, setShowAuth] = useState(() => !!param('invite'));
  // ?reset=TOKEN (from the password-reset email) takes over the screen until it's used.
  const [resetToken, setResetToken] = useState<string | null>(() => param('reset'));

  // The socket follows the session: connect when a token appears, close when it goes away.
  useEffect(() => {
    if (token) connectSocket(token);
    else disconnectSocket();
  }, [token]);

  useEffect(() => {
    const onExpired = () => {
      queryClient.clear();
      clearAuth();
    };
    const onRefreshed = (e: Event) => useAppStore.getState().setTokens((e as CustomEvent<{ token: string }>).detail.token);
    // Another tab logged in/out or refreshed the session → follow it.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== TOKEN_KEY) return;
      if (e.newValue) useAppStore.getState().setTokens(e.newValue);
      else onExpired();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    window.addEventListener(TOKENS_REFRESHED_EVENT, onRefreshed);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
      window.removeEventListener(TOKENS_REFRESHED_EVENT, onRefreshed);
      window.removeEventListener('storage', onStorage);
    };
  }, [clearAuth]);

  // ?verify=TOKEN (from the confirmation email): confirm the address once, whoever is logged in.
  useEffect(() => {
    const verify = param('verify');
    if (!verify) return;
    cleanUrl('verify');
    const { toast, user: current, setUser } = useAppStore.getState();
    Api.verifyEmail(verify)
      .then((r) => {
        toast(r.joinedWorkspaces ? `Email verified — you've been added to ${r.joinedWorkspaces} workspace${r.joinedWorkspaces === 1 ? '' : 's'}` : 'Email verified — thank you!', 'success');
        if (current && current.id === r.user.id) setUser(r.user);
        void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      })
      .catch((e) => toast(errorMessage(e, 'That verification link is invalid or has expired'), 'error'));
  }, []);

  let screen;
  if (resetToken) {
    screen = <AuthPage resetToken={resetToken} onBackToLanding={() => { cleanUrl('reset'); setResetToken(null); }} onResetDone={() => { cleanUrl('reset'); setResetToken(null); setShowAuth(true); }} />;
  } else if (token && user) {
    screen = <Shell />;
  } else if (showAuth) {
    screen = <AuthPage onBackToLanding={() => setShowAuth(false)} />;
  } else {
    screen = <Landing onLaunch={() => setShowAuth(true)} />;
  }

  return (
    <>
      {screen}
      <Toasts />
    </>
  );
}
