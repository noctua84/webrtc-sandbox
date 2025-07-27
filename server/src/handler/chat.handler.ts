// server/src/handler/chat.handler.ts

import { Socket } from 'socket.io';
import type {
    SendMessageRequest,
    SendMessageResponse,
    EditMessageRequest,
    EditMessageResponse,
    DeleteMessageRequest,
    DeleteMessageResponse,
    TypingIndicatorRequest,
    TypingIndicatorResponse, EditMessageContext, DeleteMessageContext,
} from '../types/chat.types';
import {ErrorResponse} from "../types/webrtc.types";
import {Container, createHandler} from "../di";
import {SocketConnectionContext} from "../types/socket.types";


export const sendMessageHandler = createHandler(
    ['roomManager', 'logger', 'chatManager', 'metrics', 'io'],
    (roomManager, logger, chatManager, metrics, io) => (
        socket: Socket,
        data: SendMessageRequest,
        callback: (response: any) => void
    ) => {
        const startTime = Date.now();

        try {
            metrics.recordSocketEvent('send-message', 'inbound');

            // Validate input
            if (!data.roomId || !data.content || data.content.trim().length === 0) {
                metrics.recordError('validation', 'error', 'Invalid send-message data');
                logger.error('Invalid send-message data', { socketId: socket.id, roomId: data.roomId, content: data.content });

                const response: ErrorResponse = {
                    success: false,
                    error: 'Room ID and message content are required'
                };
                return callback(response);
            }

            if (data.content.trim().length > 1000) {
                logger.error('Message too long', { socketId: socket.id, roomId: data.roomId, length: data.content.length });
                metrics.recordError('validation', 'warning', 'Message too long');

                const response: ErrorResponse = {
                    success: false,
                    error: 'Message cannot exceed 1000 characters'
                };
                return callback(response);
            }

            // Validate room membership
            const senderRoomId = roomManager.getRoomBySocketId(socket.id);
            if (senderRoomId !== data.roomId) {
                metrics.recordError('room', 'error', 'Sender not in room');
                logger.error('Sender not in room', {
                    socketId: socket.id,
                    roomId: data.roomId,
                    senderRoomId
                });

                const response: ErrorResponse = {
                    success: false,
                    error: 'You are not in this room'
                };
                return callback(response);
            }

            const room = roomManager.getRoomById(data.roomId);
            if (!room) {
                metrics.recordError('room', 'error', 'Room not found');
                logger.error('Room not found', {
                    socketId: socket.id,
                    roomId: data.roomId
                });

                const response: ErrorResponse = {
                    success: false,
                    error: 'Room not found'
                };
                return callback(response);
            }

            const sender = room.participants.get(socket.id);
            if (!sender) {
                const response: ErrorResponse = {
                    success: false,
                    error: 'Sender not found in room'
                };
                return callback(response);
            }

            const message = chatManager.createMessage({
                roomId: data.roomId,
                senderId: socket.id,
                senderName: sender.userName,
                content: data.content,
                type: data.type || 'text', // Default to 'text' if not provided
                mentions: data.mentions || [],
                timestamp: new Date().toISOString()
            })

            // Record metrics
            metrics.recordChatMessage(data.type, data.content.length);

            const processingTime = Date.now() - startTime;
            metrics.recordSocketEvent('send-message', 'outbound', processingTime);

            const response: SendMessageResponse = {
                success: true,
                message
            };
            callback(response);

            // Broadcast message to all participants
            io.to(data.roomId).emit('chat-message', message);

        } catch (error) {
            const err = error as Error;
            metrics.recordError('chat', 'error', err.message);

            logger.error('Error handling send-message', {
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
    }
);

// ================================
// EDIT MESSAGE HANDLER
// ================================

export const editMessageHandler = createHandler(
    ['logger', 'schemas', 'metrics', 'roomManager', 'io', 'chatManager'] as const,
    (logger, schemas, metrics, roomManager, io, chatManager) =>
        (socket: Socket, data: EditMessageRequest, callback: (response: any) => void) => {
            const startTime = Date.now();

            metrics.recordSocketEvent('edit-message', 'inbound');

            logger.info('Received edit-message request', {
                socketId: socket.id,
                roomId: data.roomId,
                messageId: data.messageId,
                newContentLength: data.newContent?.length
            });

            try {
                // Validation
                const { error, value } = schemas.editMessage.validate(data);
                if (error) {
                    metrics.recordError('validation', 'error');
                    logger.error('Validation failed for edit-message', {
                        socketId: socket.id,
                        roomId: data.roomId,
                        messageId: data.messageId,
                        error: error.details.map((d: any) => d.message).join(', ')
                    });

                    const response = {
                        success: false,
                        error: 'Validation failed: ' + error.details.map((d: any) => d.message).join(', ')
                    };
                    return callback(response);
                }

                // Content validation
                if (data.newContent.length > 1000) {
                    metrics.recordError('validation', 'error', 'Message too long');
                    logger.error('Edit message content too long', {
                        socketId: socket.id,
                        roomId: data.roomId,
                        messageId: data.messageId,
                        length: data.newContent.length
                    });
                    const response = {
                        success: false,
                        error: 'Message cannot exceed 1000 characters'
                    };
                    return callback(response);
                }

                // Room membership validation
                const senderRoomId = roomManager.getRoomBySocketId(socket.id);
                if (senderRoomId !== data.roomId) {
                    metrics.recordError('room', 'error', 'Sender not in room');
                    logger.error('Edit attempt by participant not in room', {
                        socketId: socket.id,
                        roomId: data.roomId,
                        senderRoomId
                    });
                    const response = {
                        success: false,
                        error: 'You are not in this room'
                    };
                    return callback(response);
                }

                // Update message
                const update_context: EditMessageContext = {
                    roomId: data.roomId,
                    messageId: data.messageId,
                    newContent: data.newContent,
                    senderId: data.senderId || socket.id, // Use senderId if provided, otherwise use socket.id
                    senderName: data.senderName || '',
                    editedBy: data.senderId || socket.id // Use senderId if provided, otherwise use socket.id
                }
                const updatedMessage = chatManager.editMessage(update_context);
                if (!updatedMessage) {
                    metrics.recordError('chat', 'error', 'Message not found or cannot be edited');
                    logger.error('Edit attempt for non-existent message', {
                        socketId: socket.id,
                        messageId: data.messageId,
                        roomId: data.roomId
                    });
                    const response = {
                        success: false,
                        error: 'Message not found or cannot be edited'
                    };
                    return callback(response);
                }

                // Verify ownership
                if (updatedMessage.senderId !== socket.id) {
                    metrics.recordError('chat', 'error', 'Edit attempt by non-owner');
                    logger.error('Edit attempt by non-owner', {
                        socketId: socket.id,
                        messageId: data.messageId,
                        roomId: data.roomId,
                        senderId: updatedMessage.senderId
                    });
                    const response = {
                        success: false,
                        error: 'You can only edit your own messages'
                    };
                    return callback(response);
                }

                // Record metrics
                metrics.recordChatMessage('text', data.newContent.length, 'edit'); // Record as edit

                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('edit-message', 'outbound', processingTime);

                const response: EditMessageResponse = {
                    success: true,
                    message: updatedMessage
                };
                callback(response);

                // Broadcast edit to all participants
                io.to(data.roomId).emit('chat-message-edited', updatedMessage);

            } catch (error) {
                const err = error as Error;
                metrics.recordError('chat', 'error');

                logger.error('Error handling edit-message', {
                    socketId: socket.id,
                    error: err.message,
                    stack: err.stack
                });

                const response = {
                    success: false,
                    error: 'Internal server error while editing message'
                };
                callback(response);
            }
        }
);

// ================================
// DELETE MESSAGE HANDLER
// ================================

export const deleteMessageHandler = createHandler(
    ['logger', 'schemas', 'metrics', 'roomManager', 'io', 'chatManager'] as const,
    (logger, schemas, metrics, roomManager, io, chatManager) =>
        (socket: Socket, data: DeleteMessageRequest, callback: (response: any) => void) => {
            const startTime = Date.now();

            metrics.recordSocketEvent('delete-message', 'inbound');

            try {
                // Validation
                const { error, value } = schemas.deleteMessage.validate(data);
                if (error) {
                    metrics.recordError('validation', 'error', 'Invalid delete-message data');
                    logger.error('Validation failed for delete-message', {
                        socketId: socket.id,
                        roomId: data.roomId,
                        messageId: data.messageId,
                        error: error.details.map((d: any) => d.message).join(', ')
                    });
                    const response = {
                        success: false,
                        error: 'Validation failed: ' + error.details.map((d: any) => d.message).join(', ')
                    };
                    return callback(response);
                }

                // Room membership validation
                const senderRoomId = roomManager.getRoomBySocketId(socket.id);
                if (senderRoomId !== data.roomId) {
                    metrics.recordError('room', 'error', 'Sender not in room');
                    logger.error('Delete attempt by participant not in room', {
                        socketId: socket.id,
                        roomId: data.roomId,
                        senderRoomId
                    });
                    const response = {
                        success: false,
                        error: 'You are not in this room'
                    };
                    return callback(response);
                }

                const context: DeleteMessageContext = {
                    roomId: data.roomId,
                    messageId: data.messageId,
                    deletedBy: data.deletedBy
                }



                // Delete message
                const deleted = chatManager.deleteMessage(context)
                if (!deleted) {
                    metrics.recordError('chat', 'error', 'Failed to delete message');
                    logger.error('Failed to delete message', {
                        socketId: socket.id,
                        messageId: data.messageId,
                        roomId: data.roomId
                    });
                    const response = {
                        success: false,
                        error: 'Failed to delete message'
                    };
                    return callback(response);
                }

                // Record metrics
                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('delete-message', 'outbound', processingTime);

                const response: DeleteMessageResponse = {
                    success: true,
                    messageId: data.messageId
                };
                callback(response);

                // Broadcast deletion to all participants
                io.to(data.roomId).emit('chat-message-deleted', { roomId: data.roomId, messageId: data.messageId });

            } catch (error: any) {
                const err = error as Error;
                metrics.recordError('chat', 'error', err.message);

                logger.error('Error handling delete-message', {
                    socketId: socket.id,
                    error: err.message,
                    stack: err.stack
                });

                const response = {
                    success: false,
                    error: 'Internal server error while deleting message'
                };

                callback(response);
            }
        }
);

// ================================
// TYPING INDICATOR HANDLER
// ================================

export const typingIndicatorHandler = createHandler(
    ['logger', 'schemas', 'metrics', 'roomManager', 'io'] as const,
    (logger, schemas, metrics, roomManager, io) =>
        (socket: Socket, data: TypingIndicatorRequest, callback: (response: any) => void) => {
            // Don't record socket events for typing - too noisy
            // But do record typing metrics
            metrics.recordTypingIndicator(data.isTyping ? 'start' : 'stop');

            try {
                const { roomId, isTyping } = data;

                // Validation
                const { error, value } = schemas.typingIndicator.validate(data);
                if (error) {
                    metrics.recordError('validation', 'error', 'Invalid typing indicator data');
                    const response = {
                        success: false,
                        error: 'Validation failed: ' + error.details.map((d: any) => d.message).join(', ')
                    };
                    return callback(response);
                }

                // Room membership validation
                const senderRoomId = roomManager.getRoomBySocketId(socket.id);
                if (senderRoomId !== roomId) {
                    metrics.recordError('room', 'warning');
                    const response = {
                        success: false,
                        error: 'You are not in this room'
                    };
                    return callback(response);
                }

                // Get sender info
                const room = roomManager.getRoomById(roomId);
                const sender = room?.participants.get(socket.id);

                if (!sender) {
                    metrics.recordError('room', 'error');
                    const response = {
                        success: false,
                        error: 'Sender not found in room'
                    };
                    return callback(response);
                }

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

                // Only log start typing to avoid spam
                if (isTyping) {
                    logger.info('Typing indicator started', {
                        roomId,
                        userId: socket.id,
                        userName: sender.userName
                    });
                }

            } catch (error) {
                const err = error as Error;
                metrics.recordError('chat', 'error');

                logger.error('Error handling typing indicator', {
                    socketId: socket.id,
                    error: err.message
                });

                const response = {
                    success: false,
                    error: 'Internal server error while handling typing indicator'
                };
                callback(response);
            }
        }
);

// ================================
// GET CHAT HISTORY HANDLER
// ================================

export const getChatHistoryHandler = createHandler(
    ['logger', 'chatManager', 'metrics', 'roomManager'] as const,
    (logger, chatManager, metrics, roomManager) =>
        (socket: Socket, data: { roomId: string }, callback: (response: any) => void) => {
            const startTime = Date.now();

            metrics.recordSocketEvent('get-chat-history', 'inbound');

            logger.info('Received get-chat-history request', {
                socketId: socket.id,
                roomId: data.roomId
            });

            try {
                const { roomId } = data;

                if (!roomId) {
                    metrics.recordError('validation', 'error', 'Room ID is required');
                    logger.error('Get chat history request without room ID', {
                        socketId: socket.id
                    });
                    const response = {
                        success: false,
                        error: 'Room ID is required'
                    };
                    return callback(response);
                }

                // Validate room membership
                const requesterRoomId = roomManager.getRoomBySocketId(socket.id);
                if (requesterRoomId !== roomId) {
                    metrics.recordError('room', 'error', 'Requester not in room');
                    logger.error('Get chat history request by participant not in room', {
                        socketId: socket.id,
                        roomId: roomId,
                        requesterRoomId
                    });
                    const response = {
                        success: false,
                        error: 'You are not in this room'
                    };
                    return callback(response);
                }

                // Get chat history
                const messages = chatManager.getRoomMessages(roomId, {
                    offset: 0,
                    limit: undefined, // No limit for history retrieval
                    includeDeleted: false,
                });

                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('get-chat-history', 'outbound', processingTime);

                const response = {
                    success: true,
                    messages: messages || []
                };
                callback(response);

                // Also emit the chat-history event as backup
                socket.emit('chat-history', {
                    roomId,
                    messages: messages || []
                });

            } catch (error: any) {
                const err = error as Error;
                metrics.recordError('chat', 'error', err.message);

                logger.error('Error getting chat history', {
                    error: err.message,
                    stack: err.stack,
                    socketId: socket.id
                });

                const response = {
                    success: false,
                    error: 'Internal server error while getting chat history'
                };
                callback(response);
            }
        }
);

// ================================
// HANDLER REGISTRATION FUNCTION
// ================================

export function registerChatHandlers(container: Container, context: SocketConnectionContext) {
    const logger = container.get<'logger'>('logger'); // Use any to avoid strict typing issues

    logger.info('Registering chat handlers', { socketId: context.connectionId });

    // Convert handlers to actual functions using the container
    const sendMessage = sendMessageHandler(container);
    const editMessage = editMessageHandler(container);
    const deleteMessage = deleteMessageHandler(container);
    const typingIndicator = typingIndicatorHandler(container);
    const getChatHistory = getChatHistoryHandler(container);

    // Register socket event listeners
    context.socket.on('send-message', sendMessage);
    context.socket.on('edit-message', editMessage);
    context.socket.on('delete-message', deleteMessage);
    context.socket.on('typing-indicator', typingIndicator);
    context.socket.on('get-chat-history', getChatHistory);

    logger.success('Chat handlers registered successfully', {
        socketId: context.connectionId,
        handlers: [
            'send-message',
            'edit-message',
            'delete-message',
            'typing-indicator',
            'get-chat-history'
        ]
    });

    // Return handlers for testing or cleanup
    return {
        sendMessage,
        editMessage,
        deleteMessage,
        typingIndicator,
        getChatHistory
    };
}


/**
// Add reaction handler
export const handleAddReaction = (
    socket: Socket,
    manager: RoomManager,
    io: Server,
    data: AddReactionRequest,
    callback: (response: any) => void
) => {
    log('info', 'Received add-reaction request', {
        socketId: socket.id,
        roomId: data.roomId,
        messageId: data.messageId,
        emoji: data.emoji
    });

    try {
        const { roomId, messageId, emoji } = data;

        // Validate input
        if (!roomId || !messageId || !emoji) {
            const response: ErrorResponse = {
                success: false,
                error: 'Room ID, message ID, and emoji are required'
            };
            return callback(response);
        }

        // Validate room membership
        const senderRoomId = manager.getRoomBySocketId(socket.id);
        if (senderRoomId !== roomId) {
            const response: ErrorResponse = {
                success: false,
                error: 'You are not in this room'
            };
            return callback(response);
        }

        // Add reaction
        const reaction = messageStorage.addReaction(roomId, messageId, emoji, socket.id);
        if (!reaction) {
            const response: ErrorResponse = {
                success: false,
                error: 'Message not found'
            };
            return callback(response);
        }

        log('success', 'Reaction added successfully', {
            messageId,
            emoji,
            userId: socket.id,
            reactionCount: reaction.count
        });

        const response: AddReactionResponse = {
            success: true,
            messageId,
            reaction
        };
        callback(response);

        // Broadcast reaction to all participants
        io.to(roomId).emit('chat-reaction-added', {
            roomId,
            messageId,
            reaction
        });

    } catch (error) {
        const err = error as Error;
        log('error', 'Error handling add-reaction', {
            socketId: socket.id,
            error: err.message
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while adding reaction'
        };
        callback(response);
    }
};

// Remove reaction handler
export const handleRemoveReaction = (
    socket: Socket,
    manager: RoomManager,
    io: Server,
    data: RemoveReactionRequest,
    callback: (response: any) => void
) => {
    log('info', 'Received remove-reaction request', {
        socketId: socket.id,
        roomId: data.roomId,
        messageId: data.messageId,
        emoji: data.emoji
    });

    try {
        const { roomId, messageId, emoji } = data;

        // Validate room membership
        const senderRoomId = manager.getRoomBySocketId(socket.id);
        if (senderRoomId !== roomId) {
            const response: ErrorResponse = {
                success: false,
                error: 'You are not in this room'
            };
            return callback(response);
        }

        // Remove reaction
        const removed = messageStorage.removeReaction(roomId, messageId, emoji, socket.id);
        if (!removed) {
            const response: ErrorResponse = {
                success: false,
                error: 'Reaction not found'
            };
            return callback(response);
        }

        log('success', 'Reaction removed successfully', {
            messageId,
            emoji,
            userId: socket.id
        });

        const response: RemoveReactionResponse = {
            success: true,
            messageId,
            emoji
        };
        callback(response);

        // Broadcast reaction removal to all participants
        io.to(roomId).emit('chat-reaction-removed', {
            roomId,
            messageId,
            emoji,
            userId: socket.id
        });

    } catch (error) {
        const err = error as Error;
        log('error', 'Error handling remove-reaction', {
            socketId: socket.id,
            error: err.message
        });

        const response: ErrorResponse = {
            success: false,
            error: 'Internal server error while removing reaction'
        };
        callback(response);
    }
};

export const createSystemMessage = (
    roomId: string,
    type: SystemMessageType,
    userName: string,
    userId: string,
    isHost: boolean,
    io: Server,
    metadata?: any
): void => {
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
                return `Room created by ${userName}`;
            default:
                return `${userName} updated the room`;
        }
    };

    const systemMessage: ChatMessage = {
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

    // Store system message
    messageStorage.addMessage(systemMessage);

    // Broadcast to room
    io.to(roomId).emit('chat-system-message', systemMessage);

    log('info', 'System message created', {
        type,
        userName,
        isHost,
        roomId,
        content: systemMessage.content
    });
};

// Clean up messages when room is deleted
export const cleanupRoomMessages = (roomId: string): void => {
    log('info', 'Cleaning up messages for deleted room', { roomId });
    messageStorage.clearRoomMessages(roomId);
};
 */