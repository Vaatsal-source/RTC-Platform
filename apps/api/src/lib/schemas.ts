import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email')),
  password: z.string().min(1, 'Password required'),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Workspace name too short').max(100),
  description: z.string().trim().max(500).optional(),
});

export const updateWorkspaceSchema = createWorkspaceSchema.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const inviteMemberSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    userId: objectId.optional(),
  })
  .refine((v) => v.email || v.userId, 'email or userId required');

export const joinWorkspaceSchema = z.object({ code: z.string().trim().min(4).max(64) });
export const roleSchema = z.object({ role: z.enum(['admin', 'member']) });

export const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Channel name too short')
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-_]*$/, 'Use lowercase letters, numbers, - and _'),
  isPrivate: z.boolean().optional().default(false),
  memberIds: z.array(objectId).max(200).optional().default([]),
});

export const renameChannelSchema = z.object({ name: createChannelSchema.shape.name });
export const channelMemberSchema = z.object({ userId: objectId });
export const createDmSchema = z.object({ userId: objectId });

export const historyQuerySchema = z.object({
  before: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Query too short').max(100),
  workspaceId: objectId.optional(),
});

export const userSearchSchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  workspaceId: objectId.optional(),
});

export const markReadSchema = z.object({ ids: z.array(objectId).max(200).optional() });

export const notificationsQuerySchema = z.object({
  unread: z.enum(['1', 'true']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(10).max(200) });
export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email('Invalid email')) });
export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
export const verifyEmailSchema = z.object({ token: z.string().min(10).max(200) });
export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});
