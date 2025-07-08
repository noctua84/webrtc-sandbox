// server/src/handler/chat.handler.ts

import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../logging';
import type {
    ErrorResponse,
    SendMessageRequest,
    SendMessageResponse,
    EditMessageRequest,
    EditMessageResponse,
    DeleteMessageRequest,
    DeleteMessageResponse,
    TypingIndicatorRequest,
    TypingIndicatorResponse,
    ChatMessage
} from '../types';
import { RoomManager } from '../roomManager';

// In-memory message storage (replace with database in production)
class MessageStorage {
    private messages = new Map<string, ChatMessage[]>(); // roomId -> messages[]

    addMessage(message: ChatMessage): void {
        if (!this.messages.has(message.roomId)) {
            this.messages.set(message.roomId, []);
        }

        const roomMessages = this.messages.get(message.roomId)!;
        roomMessages.push(message);

        // Keep only last 200 messages per room
        if (roomMessages.length > 200) {
            this.messages.set(message.roomId, roomMessages.slice(-200));
        }

        // Debug log
        log('info', 'Message added to storage', {
            roomId: message.roomId,
            messageId: message.id,
            totalMessages: roomMessages.length
        });
    }

    getMessages(roomId: string): ChatMessage[] {
        const messages = this.messages.get(roomId) || [];

        // Debug log
        log('info', 'Messages retrieved from storage', {
            roomId,
            messageCount: messages.length,
            hasMessages: messages.length > 0
        });

        return messages;
    }

    updateMessage(roomId: string, messageId: string, newContent: string): ChatMessage | null {
        const messages = this.messages.get(roomId);
        if (!messages) return null;

        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return null;

        const message = messages[messageIndex];

        if (message === undefined || message === null) {
            log('error', 'Attempted to update a message that does not exist', { roomId, messageId });
            return null;
        }

        message.content = newContent;
        message.edited = true;
        message.editedAt = new Date().toISOString();

        return message;
    }

    deleteMessage(roomId: string, messageId: string): boolean {
        const messages = this.messages.get(roomId);
        if (!messages) return false;

        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return false;

        messages.splice(messageIndex, 1);
        return true;
    }

    clearRoomMessages(roomId: string): void {
        this.messages.delete(roomId);
    }
}

const messageStorage = new MessageStorage();

export const handleSendMessage = (
    socket: Socket,
    manager: RoomManager,
    io: Server,
    data: SendMessageRequest,
    callback: (response: any) => void
) => {
    log('info', 'Received send-message request', {
        socketId: socket.id,
        roomId: data.roomId,
        contentLength: data.content?.length,
        type: data.type
    });

    try {
        const { roomId, content, type = 'text', replyTo } = data;

        // Validate input
        if (!roomId || !content || content.trim().length === 0) {
            log('error', 'Invalid send-message data', { socketId: socket.id, roomId, content });
            const response: ErrorResponse = {
                success: false,
                error: 'Room ID and message content are required'
            };
            return callback(response);
        }

        // Validate message length
        if (content.trim().length > 1000) {
            log('error', 'Message too long', { socketId: socket.id, roomId, length: content.length });
            const response: ErrorResponse = {
                success: false,
                error: 'Message cannot exceed 1000 characters'
            };
            return callback(response);
        }

        // Validate that sender is in the room
        const senderRoomId = manager.getRoomBySocketId(socket.id);
        if (senderRoomId !== roomId) {
            log('error', 'Message from participant not in room', {
                socketId: socket.id,
                senderRoomId,
                requestedRoomId: roomId
            });
            const response: ErrorResponse = {
                success: false,
                error: 'You are not in this room'
            };
            return callback(response);
        }

        // Get room and sender info
        const room = manager.getRoomById(roomId);
        if (!room) {
            log('error', 'Room not found for message', { roomId, socketId: socket.id });
            const response: ErrorResponse = {
                success: false,
                error: 'Room not found'
            };
            return callback(response);
        }

        const sender = room.participants.get(socket.id);
        if (!sender) {
            log('error', 'Sender not found in room participants', { roomId, socketId: socket.id });
            const response: ErrorResponse = {
                success: false,
                error: 'Sender not found in room'
            };
            return callback(response);
        }

        // Create message
        const message: ChatMessage = {
            id: uuidv4(),
            roomId,
            senderId: socket.id,
            senderName: sender.userName,
            content: content.trim(),
            timestamp: new Date().toISOString(),
            type,
            replyTo
        };

        // Store message
        messageStorage.addMessage(message);

        log('success', 'Message created and stored', {
            messageId: message.id,
            roomId,
            sender: message.senderName,
            type: message.type
        });

        // Send response to sender
        const response: SendMessageResponse = {
            success: true,
            message
        };
        callback(response);

        // Broadcast message to all participants in the room
        io.to(roomId).emit('chat-message', message);

        log('success', 'Message broadcasted to room', {
            messageId: message.id,
            roomId,
            participantCount: room.participants.size
        });

    } catch (error) {
        const err = error as Error;
        log('error', 'Error handling send-message', {
            socketId: socket.id,
            error: err.message,
            stack: err.stack
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while sending message'
        };
        callback(response);
    }
};

export const handleEditMessage = (
    socket: Socket,
    manager: RoomManager,
    io: Server,
    data: EditMessageRequest,
    callback: (response: any) => void
) => {
    log('info', 'Received edit-message request', {
        socketId: socket.id,
        roomId: data.roomId,
        messageId: data.messageId
    });

    try {
        const { roomId, messageId, newContent } = data;

        // Validate input
        if (!roomId || !messageId || !newContent || newContent.trim().length === 0) {
            const response: ErrorResponse = {
                success: false,
                error: 'Room ID, message ID, and new content are required'
            };
            return callback(response);
        }

        // Validate that sender is in the room
        const senderRoomId = manager.getRoomBySocketId(socket.id);
        if (senderRoomId !== roomId) {
            const response: ErrorResponse = {
                success: false,
                error: 'You are not in this room'
            };
            return callback(response);
        }

        // Get original messages to verify ownership
        const messages = messageStorage.getMessages(roomId);
        const originalMessage = messages.find(m => m.id === messageId);

        if (!originalMessage) {
            const response: ErrorResponse = {
                success: false,
                error: 'Message not found'
            };
            return callback(response);
        }

        // Verify message ownership
        if (originalMessage.senderId !== socket.id) {
            const response: ErrorResponse = {
                success: false,
                error: 'You can only edit your own messages'
            };
            return callback(response);
        }

        // Update message
        const updatedMessage = messageStorage.updateMessage(roomId, messageId, newContent.trim());
        if (!updatedMessage) {
            const response: ErrorResponse = {
                success: false,
                error: 'Failed to update message'
            };
            return callback(response);
        }

        log('success', 'Message edited successfully', {
            messageId,
            roomId,
            senderId: socket.id
        });

        // Send response
        const response: EditMessageResponse = {
            success: true,
            message: updatedMessage
        };
        callback(response);

        // Broadcast edit to all participants
        io.to(roomId).emit('chat-message-edited', updatedMessage);

    } catch (error) {
        const err = error as Error;
        log('error', 'Error handling edit-message', {
            socketId: socket.id,
            error: err.message,
            stack: err.stack
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while editing message'
        };
        callback(response);
    }
};

export const handleDeleteMessage = (
    socket: Socket,
    manager: RoomManager,
    io: Server,
    data: DeleteMessageRequest,
    callback: (response: any) => void
) => {
    log('info', 'Received delete-message request', {
        socketId: socket.id,
        roomId: data.roomId,
        messageId: data.messageId
    });

    try {
        const { roomId, messageId } = data;

        // Validate input
        if (!roomId || !messageId) {
            const response: ErrorResponse = {
                success: false,
                error: 'Room ID and message ID are required'
            };
            return callback(response);
        }

        // Validate that sender is in the room
        const senderRoomId = manager.getRoomBySocketId(socket.id);
        if (senderRoomId !== roomId) {
            const response: ErrorResponse = {
                success: false,
                error: 'You are not in this room'
            };
            return callback(response);
        }

        // Get message to verify ownership
        const messages = messageStorage.getMessages(roomId);
        const message = messages.find(m => m.id === messageId);

        if (!message) {
            const response: ErrorResponse = {
                success: false,
                error: 'Message not found'
            };
            return callback(response);
        }

        // Verify ownership (or room creator can delete any message)
        const room = manager.getRoomById(roomId);
        const participant = room?.participants.get(socket.id);
        const canDelete = message.senderId === socket.id || participant?.isCreator === true;

        if (!canDelete) {
            const response: ErrorResponse = {
                success: false,
                error: 'You can only delete your own messages'
            };
            return callback(response);
        }

        // Delete message
        const deleted = messageStorage.deleteMessage(roomId, messageId);
        if (!deleted) {
            const response: ErrorResponse = {
                success: false,
                error: 'Failed to delete message'
            };
            return callback(response);
        }

        log('success', 'Message deleted successfully', {
            messageId,
            roomId,
            deletedBy: socket.id
        });

        // Send response
        const response: DeleteMessageResponse = {
            success: true,
            messageId
        };
        callback(response);

        // Broadcast deletion to all participants
        io.to(roomId).emit('chat-message-deleted', { roomId, messageId });

    } catch (error) {
        const err = error as Error;
        log('error', 'Error handling delete-message', {
            socketId: socket.id,
            error: err.message,
            stack: err.stack
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while deleting message'
        };
        callback(response);
    }
};

export const handleTypingIndicator = (
    socket: Socket,
    manager: RoomManager,
    io: Server,
    data: TypingIndicatorRequest,
    callback: (response: any) => void
) => {
    try {
        const { roomId, isTyping } = data;

        // Validate that sender is in the room
        const senderRoomId = manager.getRoomBySocketId(socket.id);
        if (senderRoomId !== roomId) {
            const response: ErrorResponse = {
                success: false,
                error: 'You are not in this room'
            };
            return callback(response);
        }

        // Get sender info
        const room = manager.getRoomById(roomId);
        const sender = room?.participants.get(socket.id);

        if (!sender) {
            const response: ErrorResponse = {
                success: false,
                error: 'Sender not found in room'
            };
            return callback(response);
        }

        // Send response
        const response: TypingIndicatorResponse = {
            success: true
        };
        callback(response);

        // Broadcast typing indicator to other participants (not sender)
        socket.to(roomId).emit('chat-typing', {
            roomId,
            userId: socket.id,
            userName: sender.userName,
            isTyping
        });

    } catch (error) {
        const err = error as Error;
        log('error', 'Error handling typing indicator', {
            socketId: socket.id,
            error: err.message
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while handling typing indicator'
        };
        callback(response);
    }
};

export const handleGetChatHistory = (
    socket: Socket,
    manager: RoomManager,
    data: { roomId: string },
    callback: (response: any) => void
) => {
    log('info', 'Received get-chat-history request', {
        socketId: socket.id,
        roomId: data.roomId
    });

    try {
        const { roomId } = data;

        // Validate input
        if (!roomId) {
            log('error', 'Missing roomId in get-chat-history request', { socketId: socket.id });
            const response = {
                success: false,
                error: 'Room ID is required'
            };
            return callback(response);
        }

        // Validate that requester is in the room
        const requesterRoomId = manager.getRoomBySocketId(socket.id);
        if (requesterRoomId !== roomId) {
            log('error', 'Chat history request from participant not in room', {
                socketId: socket.id,
                requesterRoomId,
                requestedRoomId: roomId
            });
            const response = {
                success: false,
                error: 'You are not in this room'
            };
            return callback(response);
        }

        // Get chat history
        const messages = messageStorage.getMessages(roomId);

        log('success', 'Chat history retrieved successfully', {
            roomId,
            messageCount: messages.length,
            requestedBy: socket.id
        });

        // Send response with proper structure
        const response = {
            success: true,
            messages: messages || [] // Ensure messages is always an array
        };

        callback(response);

        // ALSO emit the chat-history event as backup
        // (in case the client is still listening for events)
        socket.emit('chat-history', {
            roomId,
            messages: messages || []
        });

    } catch (error) {
        const err = error as Error;
        log('error', 'Error handling get-chat-history', {
            socketId: socket.id,
            error: err.message,
            stack: err.stack
        });

        const response = {
            success: false,
            error: 'Internal server error while retrieving chat history'
        };
        callback(response);
    }
};

// Clean up messages when room is deleted
export const cleanupRoomMessages = (roomId: string): void => {
    log('info', 'Cleaning up messages for deleted room', { roomId });
    messageStorage.clearRoomMessages(roomId);
};