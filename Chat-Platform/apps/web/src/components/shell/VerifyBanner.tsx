import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { Api, errorMessage } from '../../lib/api';
import { useAppStore } from '../../store/useAppStore';

// Shown until the user clicks the link in their confirmation email. Not blocking: chat works meanwhile,
// but invitations sent to this address before sign-up are only redeemed after verification.
export function VerifyBanner() {
  const user = useAppStore((s) => s.user);
  const toast = useAppStore((s) => s.toast);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  if (!user || user.emailVerified) return null;

  const resend = async () => {
    setSending(true);
    try {
      await Api.resendVerification();
      setSent(true);
      toast('Verification email sent', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div role="status" className="flex shrink-0 items-center justify-center gap-3 bg-amber-500/15 px-4 py-1.5 text-xs text-amber-200">
      <MailWarning size={14} />
      <span>Please confirm your email address — we sent a link to <b>{user.email}</b>.</span>
      <button onClick={resend} disabled={sending || sent} className="font-semibold underline hover:text-white disabled:no-underline disabled:opacity-60">{sent ? 'Sent' : 'Resend'}</button>
    </div>
  );
}
