import {ChatMessage} from "@/types/chat.types.ts";

export interface Participant {
    socketId: string;
    userName: string;
    isCreator: boolean;
    joinedAt: string;
    lastSeen: string;    'chat-message': (data: ChatMessage) => void;
    'chat-message-edited': (data: ChatMessage) => void;
    'chat-message-deleted': (data: { roomId: string; messageId: string }) => void;
    'chat-typing': (data: { roomId: string; userId: string; userName: string; isTyping: boolean }) => void;
    'chat-history': (data: { roomId: string; messages: ChatMessage[] }) => void;
    isConnected: boolean;
    reconnectionToken?: string;
    mediaStatus: {
        hasVideo: boolean;
        hasAudio: boolean;
        isScreenSharing: boolean;
    };
}