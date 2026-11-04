import type { NotificationKind } from '@repo/shared-types';

export interface NotificationJobData {
  userId: string; // recipient
  message: string;
  type: NotificationKind;
  channelId?: string;
  workspaceId?: string;
  senderId?: string;
  senderName?: string;
}

export interface AuditJobData {
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

export interface EmailJobData {
  to: string;
  subject: string;
  body: string;
  userId?: string;
}

export const QUEUE_NAMES = {
  notifications: 'notifications',
  audit: 'audit',
  email: 'email',
} as const;
