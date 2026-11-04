import { Types } from 'mongoose';
import { MESSAGE_PAGE_SIZE, type MessageDTO } from '@repo/shared-types';
import { Message, type IMessage } from '../models/message.js';
import { StoredFile } from '../models/file.js';
import { oid, toFileDTO } from '../serializers.js';

type LeanMessage = Pick<
  IMessage,
  | '_id'
  | 'channelId'
  | 'authorId'
  | 'authorName'
  | 'content'
  | 'parentMessageId'
  | 'attachmentIds'
  | 'reactions'
  | 'deliveredTo'
  | 'readBy'
  | 'isEdited'
  | 'isDeleted'
  | 'createdAt'
>;

/** Turn raw message docs into wire DTOs (attachments + reply counts resolved in 2 batched queries). */
export async function hydrateMessages(docs: LeanMessage[]): Promise<MessageDTO[]> {
  if (docs.length === 0) return [];

  const fileIds = docs.flatMap((d) => d.attachmentIds ?? []);
  const ids = docs.map((d) => d._id);

  const [files, replyAgg] = await Promise.all([
    fileIds.length ? StoredFile.find({ _id: { $in: fileIds } }).lean() : Promise.resolve([]),
    Message.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { parentMessageId: { $in: ids }, isDeleted: false } },
      { $group: { _id: '$parentMessageId', n: { $sum: 1 } } },
    ]),
  ]);

  const fileMap = new Map(files.map((f) => [oid(f._id), toFileDTO(f as any)]));
  const replyMap = new Map(replyAgg.map((r) => [oid(r._id), r.n]));

  return docs.map((m) => toMessageDTO(m, fileMap, replyMap));
}

export function toMessageDTO(
  m: LeanMessage,
  fileMap: Map<string, ReturnType<typeof toFileDTO>> = new Map(),
  replyMap: Map<string, number> = new Map(),
): MessageDTO {
  const deleted = m.isDeleted;
  return {
    id: oid(m._id),
    channelId: oid(m.channelId),
    content: deleted ? '' : m.content,
    timestamp: m.createdAt.toISOString(),
    user: { id: oid(m.authorId), name: m.authorName },
    parentMessageId: m.parentMessageId ? oid(m.parentMessageId) : null,
    reactions: (m.reactions ?? []).filter((r) => r.userIds.length > 0).map((r) => ({ emoji: r.emoji, userIds: [...r.userIds] })),
    attachments: deleted ? [] : (m.attachmentIds ?? []).map((id) => fileMap.get(oid(id))).filter((f): f is NonNullable<typeof f> => !!f),
    isEdited: m.isEdited,
    isDeleted: deleted,
    deliveredTo: [...(m.deliveredTo ?? [])],
    readBy: [...(m.readBy ?? [])],
    replyCount: replyMap.get(oid(m._id)) ?? 0,
  };
}

/** `before` may be a message id (preferred) or an ISO timestamp. */
function cursorFilter(before?: string): Record<string, unknown> {
  if (!before) return {};
  if (Types.ObjectId.isValid(before) && /^[a-f0-9]{24}$/i.test(before)) return { _id: { $lt: new Types.ObjectId(before) } };
  const d = new Date(before);
  if (!Number.isNaN(d.getTime())) return { createdAt: { $lt: d } };
  return {};
}

/** Top-level (non-thread) messages, oldest-first within the page. */
export async function fetchChannelHistory(
  channelId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<{ messages: MessageDTO[]; hasMore: boolean }> {
  const limit = Math.min(opts.limit ?? MESSAGE_PAGE_SIZE, 100);
  const docs = await Message.find({
    channelId: new Types.ObjectId(channelId),
    parentMessageId: null,
    isDeleted: false,
    ...cursorFilter(opts.before),
  })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit).reverse();
  return { messages: await hydrateMessages(page as LeanMessage[]), hasMore };
}

export async function fetchReplies(parentMessageId: string): Promise<MessageDTO[]> {
  const docs = await Message.find({ parentMessageId: new Types.ObjectId(parentMessageId), isDeleted: false })
    .sort({ _id: 1 })
    .limit(500)
    .lean();
  return hydrateMessages(docs as LeanMessage[]);
}
