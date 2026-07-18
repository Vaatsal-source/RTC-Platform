// ─── Notification Job ────────────────────────────

export interface NotificationJobData {
  userId: string;        // who receives the notification
  message: string;       // notification text
  type: 'mention' | 'message' | 'invite';  // what kind
  channelId?: string;    // optional - which channel
  senderId?: string;     // optional - who triggered it
}

// ─── Audit Job ───────────────────────────────────

export interface AuditJobData {
  userId: string;        // who did the action
  action: string;        // what they did
  metadata?: Record<string, unknown>;  // any extra info
  timestamp?: number;    // when it happened
}

// ─── Email Job ───────────────────────────────────

export interface EmailJobData {
  to: string;            // recipient email
  subject: string;       // email subject
  body: string;          // email content
  userId?: string;       // optional - which user
}