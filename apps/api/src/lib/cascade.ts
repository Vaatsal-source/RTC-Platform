import { Channel, Message, StoredFile, type IChannel } from '@repo/database';
import { invalidateChannelMembers } from '@repo/queue';
import { storage } from './storage.js';

/** Removes the user from every private channel in the workspace. */
export async function removeUserFromWorkspaceChannels(workspaceId: string, userId: string): Promise<void> {
  const ids = await Channel.find({ workspaceId, kind: 'private', memberIds: userId }).distinct('_id');
  if (ids.length === 0) return;
  await Channel.updateMany({ _id: { $in: ids } }, { $pull: { memberIds: userId } });
  await invalidateChannelMembers(...ids.map(String));
}

/** Deletes a channel plus its messages and uploaded files (rows and bytes). */
export async function deleteChannelCascade(channel: IChannel): Promise<void> {
  const files = await StoredFile.find({ channelId: channel._id }).select('storageName').lean();
  await Promise.all([
    Message.deleteMany({ channelId: channel._id }),
    StoredFile.deleteMany({ channelId: channel._id }),
    Channel.deleteOne({ _id: channel._id }),
  ]);
  await Promise.all(files.map((f) => storage.remove(f.storageName)));
  await invalidateChannelMembers(String(channel._id));
}
