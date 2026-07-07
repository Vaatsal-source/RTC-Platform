export type ChannelType = 'public' | 'private' | 'archived';
export type UserRole = 'admin' | 'member';

export interface ReactionProps {
  emoji: string;
  count: number;
  userReacted: boolean;
}

export interface ThreadReplyProps {
  id: string;
  user: {
    name: string;
    avatarUrl?: string;
  };
  content: string;
  timestamp: string;
}

export interface MessageProps {
  id: string;
  user: {
    name: string;
    avatarUrl?: string;
    isSystem?: boolean;
    role?: UserRole;
  };
  content: string;
  timestamp: string;
  isEdited?: boolean;
  reactions?: ReactionProps[];
  replies?: ThreadReplyProps[];
}

export interface ChannelProps {
  id: string;
  name: string;
  type: ChannelType;
}

export interface MemberProps {
  id: string;
  name: string;
  role: UserRole;
  status: 'online' | 'offline';
}