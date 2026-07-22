import {
    auditQueue,
    emailQueue,
    notificationQueue,
    type AuditJobData,
    type EmailJobData,
    type NotificationJobData,
} from "../../../../packages/queue/src/index";

export async function enqueueAudit(
    action: string,
    userId: string,
    metadata: Record<string, unknown> = {}
): Promise<void> {
    try {
        await auditQueue.add(action, {
            userId,
            action,
            metadata,
            timestamp: Date.now(),
        } as AuditJobData);
    } catch (err) {
        console.error(`[Queue] Failed to enqueue audit job (${action}):`, err);
    }
}

export async function enqueueEmail(jobName: string, data: EmailJobData): Promise<void> {
    try {
        await emailQueue.add(jobName, data);
    } catch (err) {
        console.error(`[Queue] Failed to enqueue email job (${jobName}):`, err);
    }
}

export async function enqueueNotification(jobName: string, data: NotificationJobData): Promise<void> {
    try {
        await notificationQueue.add(jobName, data);
    } catch (err) {
        console.error(`[Queue] Failed to enqueue notification job (${jobName}):`, err);
    }
}