import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export function validate(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

// ── Schemas ──────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(2, 'Workspace name too short').max(100),
  description: z.string().max(500).optional(),
});

export const addMemberSchema = z.object({
  workspaceId: z.string().min(1, 'workspaceId required'),
  userId: z.string().min(1, 'userId required'),
});

export const createChannelSchema = z.object({
  name: z.string().min(2, 'Channel name too short').max(100),
  workspaceId: z.string().min(1, 'workspaceId required'),
  isPrivate: z.boolean().optional().default(false),
});

export const sendMessageSchema = z.object({
  channelId: z.string().min(1, 'channelId required'),
  content: z.string().min(1, 'Message cannot be empty').max(2000),
});

export const editMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(2000),
});
