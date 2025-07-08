import {ChatMessage, SystemMessageType} from "@/types/chat.types.ts";

export const createSystemMessage = (
    roomId: string,
    type: SystemMessageType,
    userName: string,
): ChatMessage => {
    const getSystemMessageContent = (): string => {
        switch (type) {
            case 'participant-joined':
                return `${userName} joined the room`;
            case 'participant-left':
                return `${userName} left the room`;
            case 'host-joined':
                return `${userName} (host) joined the room`;
            case 'host-left':
                return `${userName} (host) left the room`;
            case 'host-changed':
                return `${userName} is now the host`;
            case 'room-created':
                return `${userName} created the room`;
            default:
                return `${userName} updated the room`;
        }
    };

    return {
        id: `system-${Date.now()}-${Math.random()}`,
        roomId,
        senderId: 'system',
        senderName: 'System',
        content: getSystemMessageContent(),
        timestamp: new Date().toISOString(),
        type: 'system',
        mentions: [],
        reactions: []
    };
};

// Helper function to parse mentions from message content
export const parseMentions = (content: string, participants: { socketId: string; userName: string }[]): string[] => {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
        const username = match[1];
        const participant = participants.find(p =>
            p.userName.toLowerCase() === username?.toLowerCase()
        );
        if (participant) {
            mentions.push(participant.socketId);
        }
    }

    return mentions;
};

// Helper function to highlight mentions in content
export const highlightMentions = (content: string, participants: { socketId: string; userName: string }[]): string => {
    const mentionRegex = /@(\w+)/g;

    return content.replace(mentionRegex, (match, username) => {
        const participant = participants.find(p =>
            p.userName.toLowerCase() === username.toLowerCase()
        );

        if (participant) {
            return `<span class="mention">@${username}</span>`;
        }

        return match;
    });
};