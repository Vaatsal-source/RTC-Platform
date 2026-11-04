import { AuditLog } from '@repo/database';
import type { AuditJobData } from '@repo/queue';

// Audit Queue:  Action → Queue → Worker → Audit Log
export async function processAudit({ userId, action, metadata, timestamp }: AuditJobData): Promise<void> {
  await AuditLog.create({ userId, action, metadata: metadata ?? {}, timestamp: timestamp ?? Date.now() });
}
