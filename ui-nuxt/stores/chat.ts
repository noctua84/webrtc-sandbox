// stores/chat.store.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSocket } from '../composables/useSocket'
import { useRoomStore } from './room'
import {
    ChatMessage,
    MessageReaction,
    DeleteMessageRequest,
    DeleteMessageResponse,
    EditMessageRequest,
    SendMessageResponse,
    EditMessageResponse,
    AddReactionRequest,
    RemoveReactionRequest,
    SendMessageRequest,
    SystemMessageType,
    TypingIndicatorRequest,
    ChatParticipant,
    ChatError,
} from '../types/chat.types'

export const useChatStore = defineStore('chat', () => {
    // State
    const messages = ref<ChatMessage[]>([])
    const participants = ref<ChatParticipant[]>([])
    const typingUsers = ref(new Set<string>())
    const isLoading = ref(false)
    const error = ref<ChatError | null>(null)
    const hasLoadedHistory = ref(false)

    // Timeout for typing indicators
    let typingTimeout: NodeJS.Timeout | null = null
    let lastTypingTime = 0

    // Dependencies
    const socketStore = useSocket()
    const roomStore = useRoomStore()

    // Computed
    const hasMessages = computed(() => messages.value.length > 0)

    const canSendMessage = computed(() =>
        roomStore.isInRoom && !isLoading.value
    )

    const shouldShowLoading = computed(() =>
        isLoading.value && messages.value.length === 0
    )

    const lastMessage = computed(() =>
        messages.value.length > 0 ? messages.value[messages.value.length - 1] : null
    )

    const mentionNotifications = computed(() => {
        if (!roomStore.currentParticipant) return []

        return messages.value.filter(message =>
            message.mentions?.includes(roomStore.currentParticipant!.socketId) &&
            message.senderId !== roomStore.currentParticipant!.socketId
        )
    })

    // Production logging utility
    const setError = (message: string, code?: string) => {
        error.value = {
            message,
            code,
            timestamp: new Date().toISOString()
        }

        // Only log errors in development or with proper error tracking service
        if (process.env.NODE_ENV === 'development') {
            console.error(`[CHAT ERROR] ${message}`, { code, timestamp: error.value.timestamp })
        }
        // In production, you would send to error tracking service (Sentry, etc.)
    }

    const clearError = () => {
        error.value = null
    }

    const debugLog = (message: string, data?: any) => {
        // Only log debug info in development
        if (process.env.NODE_ENV === 'development') {
            console.log(`[CHAT] ${message}`, data)
        }
    }

    // Helper functions
    const createSystemMessage = (
        type: SystemMessageType,
        userName: string,
        roomId: string
    ): ChatMessage => {
        const messageMap = {
            'participant-joined': `${userName} joined the room`,
            'participant-left': `${userName} left the room`,
            'host-joined': `${userName} joined as host`,
            'host-left': `${userName} left (was host)`,
            'host-changed': `${userName} is now the host`,
            'room-created': `Room created by ${userName}`
        }

        return {
            id: `system-${Date.now()}-${Math.random()}`,
            roomId,
            senderId: 'system',
            senderName: 'System',
            content: messageMap[type] || `System: ${type}`,
            timestamp: new Date().toISOString(),
            type: 'system'
        }
    }

    const parseMentions = (content: string): string[] => {
        const mentionRegex = /@(\w+)/g
        const mentions: string[] = []
        let match

        while ((match = mentionRegex.exec(content)) !== null) {
            const userName = match[1]
            const participant = roomStore.participants.find(p => p.userName === userName)
            if (participant) {
                mentions.push(participant.socketId)
            }
        }

        return mentions
    }

    // Actions
    const setupSocketListeners = () => {
        debugLog('Setting up chat socket listeners')

        // Handle incoming messages
        socketStore.on('chat-message', (message: ChatMessage) => {
            handleIncomingMessage(message)
        })

        // Handle message edits
        socketStore.on('chat-message-edited', (message: ChatMessage) => {
            handleMessageEdited(message)
        })

        // Handle message deletions
        socketStore.on('chat-message-deleted', (data: { roomId: string; messageId: string }) => {
            handleMessageDeleted(data)
        })

        // Handle typing indicators
        socketStore.on('chat-typing', (data: {
            roomId: string
            userId: string
            userName: string
            isTyping: boolean
        }) => {
            handleTypingIndicator(data)
        })

        // Handle reaction added
        socketStore.on('chat-reaction-added', (data: {
            roomId: string
            messageId: string
            reaction: MessageReaction
        }) => {
            handleReactionAdded(data)
        })

        // Handle reaction removed
        socketStore.on('chat-reaction-removed', (data: {
            roomId: string
            messageId: string
            emoji: string
            userId: string
        }) => {
            handleReactionRemoved(data)
        })

        // Handle system messages
        socketStore.on('chat-system-message', (message: ChatMessage) => {
            handleSystemMessage(message)
        })

        // Handle chat history
        socketStore.on('chat-history', (data: { roomId: string; messages: ChatMessage[] }) => {
            handleChatHistory(data)
        })

        debugLog('Chat socket listeners configured')
    }

    const handleIncomingMessage = (message: ChatMessage) => {
        if (!roomStore.currentRoom || message.roomId !== roomStore.currentRoom.id) {
            debugLog('Received message for different room', {
                messageRoomId: message.roomId,
                currentRoomId: roomStore.currentRoom?.id
            })
            return
        }

        // Add message if not already exists
        const existingIndex = messages.value.findIndex(m => m.id === message.id)
        if (existingIndex === -1) {
            messages.value.push(message)

            // Keep only last 200 messages
            if (messages.value.length > 200) {
                messages.value = messages.value.slice(-200)
            }
        }

        // Remove typing indicator for message sender
        if (typingUsers.value.has(message.senderId)) {
            typingUsers.value.delete(message.senderId)
        }
    }

    const handleMessageEdited = (message: ChatMessage) => {
        if (!roomStore.currentRoom || message.roomId !== roomStore.currentRoom.id) return

        const existingIndex = messages.value.findIndex(m => m.id === message.id)
        if (existingIndex !== -1) {
            messages.value[existingIndex] = message
        }
    }

    const handleMessageDeleted = (data: { roomId: string; messageId: string }) => {
        if (!roomStore.currentRoom || data.roomId !== roomStore.currentRoom.id) return

        const messageIndex = messages.value.findIndex(m => m.id === data.messageId)
        if (messageIndex !== -1) {
            messages.value.splice(messageIndex, 1)
        }
    }

    const handleTypingIndicator = (data: {
        roomId: string
        userId: string
        userName: string
        isTyping: boolean
    }) => {
        if (!roomStore.currentRoom || data.roomId !== roomStore.currentRoom.id) return

        // Don't show own typing indicator
        if (data.userId === roomStore.currentParticipant?.socketId) return

        if (data.isTyping) {
            typingUsers.value.add(data.userId)
        } else {
            typingUsers.value.delete(data.userId)
        }

        // Auto-remove typing indicator after 3 seconds
        if (data.isTyping) {
            setTimeout(() => {
                typingUsers.value.delete(data.userId)
            }, 3000)
        }
    }

    const handleReactionAdded = (data: {
        roomId: string
        messageId: string
        reaction: MessageReaction
    }) => {
        if (!roomStore.currentRoom || data.roomId !== roomStore.currentRoom.id) return

        const message = messages.value.find(m => m.id === data.messageId)
        if (message) {
            if (!message.reactions) message.reactions = []

            const existingReaction = message.reactions.find(r => r.emoji === data.reaction.emoji)
            if (existingReaction) {
                Object.assign(existingReaction, data.reaction)
            } else {
                message.reactions.push(data.reaction)
            }
        }
    }

    const handleReactionRemoved = (data: {
        roomId: string
        messageId: string
        emoji: string
        userId: string
    }) => {
        if (!roomStore.currentRoom || data.roomId !== roomStore.currentRoom.id) return

        const message = messages.value.find(m => m.id === data.messageId)
        if (message?.reactions) {
            const reactionIndex = message.reactions.findIndex(r => r.emoji === data.emoji)
            if (reactionIndex !== -1) {
                const reaction = message.reactions[reactionIndex]
                reaction.userIds = reaction.userIds.filter(id => id !== data.userId)
                reaction.count = reaction.userIds.length

                if (reaction.count === 0) {
                    message.reactions.splice(reactionIndex, 1)
                }
            }
        }
    }

    const handleSystemMessage = (message: ChatMessage) => {
        if (!roomStore.currentRoom || message.roomId !== roomStore.currentRoom.id) return

        messages.value.push(message)
    }

    const handleChatHistory = (data: { roomId: string; messages: ChatMessage[] }) => {
        if (!roomStore.currentRoom || data.roomId !== roomStore.currentRoom.id) return

        isLoading.value = false
        messages.value = data.messages || []
    }

    const sendMessage = async (content: string, type: 'text' | 'emoji' = 'text'): Promise<void> => {
        if (!roomStore.currentRoom) {
            throw new Error('Not in a room')
        }

        if (!content.trim()) {
            throw new Error('Message cannot be empty')
        }

        if (content.length > 1000) {
            throw new Error('Message is too long (max 1000 characters)')
        }

        clearError()

        try {
            const mentions = parseMentions(content)

            const messageData: SendMessageRequest = {
                roomId: roomStore.currentRoom.id,
                content: content.trim(),
                type,
                mentions: mentions.length > 0 ? mentions : undefined
            }

            const response = await socketStore.emit<SendMessageResponse>('send-message', messageData)

            // Stop typing indicator
            await sendTypingIndicator(false)

        } catch (err) {
            const error = err as Error
            setError(`Failed to send message: ${error.message}`, 'SEND_MESSAGE_FAILED')
            throw error
        }
    }

    const editMessage = async (messageId: string, newContent: string): Promise<void> => {
        if (!roomStore.currentRoom) {
            throw new Error('Not in a room')
        }

        if (!newContent.trim()) {
            throw new Error('Message cannot be empty')
        }

        clearError()

        try {
            const editData: EditMessageRequest = {
                roomId: roomStore.currentRoom.id,
                messageId,
                newContent: newContent.trim()
            }

            const response = await socketStore.emit<EditMessageResponse>('edit-message', editData)

        } catch (err) {
            const error = err as Error
            setError(`Failed to edit message: ${error.message}`, 'EDIT_MESSAGE_FAILED')
            throw error
        }
    }

    const deleteMessage = async (messageId: string): Promise<void> => {
        if (!roomStore.currentRoom) {
            throw new Error('Not in a room')
        }

        clearError()

        try {
            const deleteData: DeleteMessageRequest = {
                roomId: roomStore.currentRoom.id,
                messageId
            }

            const response = await socketStore.emit<DeleteMessageResponse>('delete-message', deleteData)

        } catch (err) {
            const error = err as Error
            setError(`Failed to delete message: ${error.message}`, 'DELETE_MESSAGE_FAILED')
            throw error
        }
    }

    const sendTypingIndicator = async (isTyping: boolean): Promise<void> => {
        if (!roomStore.currentRoom) return

        try {
            const now = Date.now()

            // Throttle typing indicators (max once per second)
            if (isTyping && now - lastTypingTime < 1000) {
                return
            }

            lastTypingTime = now

            const typingData: TypingIndicatorRequest = {
                roomId: roomStore.currentRoom.id,
                isTyping
            }

            await socketStore.emit('typing-indicator', typingData)

            // Clear typing timeout
            if (typingTimeout) {
                clearTimeout(typingTimeout)
            }

            // Auto-stop typing after 3 seconds
            if (isTyping) {
                typingTimeout = setTimeout(() => {
                    sendTypingIndicator(false)
                }, 3000)
            }

        } catch (err) {
            const error = err as Error
            setError(`Failed to send typing indicator: ${error.message}`, 'TYPING_INDICATOR_FAILED')
            // Don't throw for typing indicators as they're not critical
        }
    }

    const addReaction = async (messageId: string, emoji: string): Promise<void> => {
        if (!roomStore.currentRoom) {
            throw new Error('Not in a room')
        }

        clearError()

        try {
            const reactionData: AddReactionRequest = {
                roomId: roomStore.currentRoom.id,
                messageId,
                emoji
            }

            await socketStore.emit('add-reaction', reactionData)

        } catch (err) {
            const error = err as Error
            setError(`Failed to add reaction: ${error.message}`, 'ADD_REACTION_FAILED')
            throw error
        }
    }

    const removeReaction = async (messageId: string, emoji: string): Promise<void> => {
        if (!roomStore.currentRoom) {
            throw new Error('Not in a room')
        }

        clearError()

        try {
            const reactionData: RemoveReactionRequest = {
                roomId: roomStore.currentRoom.id,
                messageId,
                emoji
            }

            await socketStore.emit('remove-reaction', reactionData)

        } catch (err) {
            const error = err as Error
            setError(`Failed to remove reaction: ${error.message}`, 'REMOVE_REACTION_FAILED')
            throw error
        }
    }

    const loadChatHistory = async (): Promise<void> => {
        if (!roomStore.currentRoom) {
            throw new Error('Not in a room')
        }

        if (hasLoadedHistory.value) {
            debugLog('Chat history already loaded for this room')
            return
        }

        isLoading.value = true
        clearError()

        try {
            const historyData = { roomId: roomStore.currentRoom.id }

            const response = await socketStore.emit<{ messages: ChatMessage[] }>('get-chat-history', historyData)

            messages.value = response.messages || []
            hasLoadedHistory.value = true

        } catch (err) {
            const error = err as Error
            setError(`Failed to load chat history: ${error.message}`, 'LOAD_HISTORY_FAILED')
            throw error
        } finally {
            isLoading.value = false
        }
    }

    const clearMessages = () => {
        messages.value = []
        participants.value = []
        typingUsers.value.clear()
        isLoading.value = false
        clearError()
        hasLoadedHistory.value = false

        // Clear typing timeout
        if (typingTimeout) {
            clearTimeout(typingTimeout)
            typingTimeout = null
        }
    }

    const addSystemMessage = (type: SystemMessageType, userName: string) => {
        if (!roomStore.currentRoom) return

        const systemMessage = createSystemMessage(type, userName, roomStore.currentRoom.id)
        messages.value.push(systemMessage)
    }

    // Utility functions
    const getMessageById = (messageId: string): ChatMessage | undefined => {
        return messages.value.find(m => m.id === messageId)
    }

    const getMessagesByUser = (userId: string): ChatMessage[] => {
        return messages.value.filter(m => m.senderId === userId)
    }

    const canEditMessage = (message: ChatMessage): boolean => {
        return message.senderId === roomStore.currentParticipant?.socketId
    }

    const hasUserReacted = (message: ChatMessage, emoji: string): boolean => {
        if (!message.reactions || !roomStore.currentParticipant) return false

        const reaction = message.reactions.find(r => r.emoji === emoji)
        return reaction ? reaction.userIds.includes(roomStore.currentParticipant.socketId) : false
    }

    const isMentioned = (message: ChatMessage): boolean => {
        if (!roomStore.currentParticipant) return false
        return message.mentions?.includes(roomStore.currentParticipant.socketId) || false
    }

    const isTypingUsersArray = computed(() => Array.from(typingUsers.value))

    // Initialize socket listeners when store is created
    setupSocketListeners()

    return {
        // State
        messages,
        participants,
        typingUsers,
        isLoading,
        error,
        hasLoadedHistory,

        // Computed
        hasMessages,
        canSendMessage,
        shouldShowLoading,
        lastMessage,
        mentionNotifications,
        isTypingUsersArray,

        // Actions
        sendMessage,
        editMessage,
        deleteMessage,
        sendTypingIndicator,
        addReaction,
        removeReaction,
        loadChatHistory,
        clearMessages,
        addSystemMessage,

        // Utilities
        getMessageById,
        getMessagesByUser,
        canEditMessage,
        hasUserReacted,
        isMentioned,

        // Error handling
        setError,
        clearError,

        // Development utilities (only available in dev mode)
        ...(process.env.NODE_ENV === 'development' && { debugLog })
    }
})