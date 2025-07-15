// ui-nuxt/stores/chat.store.ts

import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import { useSocketIO } from '~/composables/useSocketIO'
import { useRoomStore } from '~/stores/room.store'
import type {
    ChatMessage,
    SendMessageRequest,
    SendMessageResponse,
    EditMessageRequest,
    EditMessageResponse,
    DeleteMessageRequest,
    DeleteMessageResponse,
    TypingIndicatorRequest,
    AddReactionRequest,
    RemoveReactionRequest,
    ChatError,
    MessageReaction
} from '~/types/chat.types'

export const useChatStore = defineStore('chat', () => {
    // State
    const messages = ref<ChatMessage[]>([])
    const participants = ref<string[]>([])
    const typingUsers = ref<Set<string>>(new Set())
    const isLoading = ref(false)
    const error = ref<string | null>(null)
    const isSendingMessage = ref(false)
    const isInitialized = ref(false)

    // Get dependencies
    const socketStore = useSocketIO()
    const roomStore = useRoomStore()

    // Computed
    const messageCount = computed(() => messages.value.length)
    const hasMessages = computed(() => messages.value.length > 0)
    const typingUserNames = computed(() => Array.from(typingUsers.value))

    const canSendMessage = computed(() => {
        return !isSendingMessage.value && roomStore.currentRoom && !error.value
    })

    // Utility functions
    const log = (level: 'info' | 'error' | 'warning' | 'success', message: string, data?: any) => {
        socketStore.addLog(level, `[CHAT] ${message}`, data)
        console.log(`[CHAT] [${level.toUpperCase()}]`, message, data || '')
    }

    const setChatError = (message: string, code?: string) => {
        error.value = message
        log('error', message, { code })
    }

    const clearError = () => {
        error.value = null
    }

    // Socket event handlers
    const handleIncomingMessage = (message: ChatMessage) => {
        if (!roomStore.currentRoom || message.roomId !== roomStore.currentRoom.id) {
            log('warning', 'Received message for different room', {
                messageRoomId: message.roomId,
                currentRoomId: roomStore.currentRoom?.id
            })
            return
        }

        log('info', 'Received chat message', {
            messageId: message.id,
            sender: message.senderName,
            type: message.type
        })

        // Add message to local state
        messages.value.push(message)

        // Remove typing indicator for sender
        typingUsers.value.delete(message.senderName)

        // Sort messages by timestamp
        messages.value.sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
    }

    const handleMessageEdited = (editedMessage: ChatMessage) => {
        log('info', 'Message edited', { messageId: editedMessage.id })

        const index = messages.value.findIndex(m => m.id === editedMessage.id)
        if (index > -1) {
            messages.value[index] = editedMessage
        }
    }

    const handleMessageDeleted = (data: { roomId: string; messageId: string }) => {
        log('info', 'Message deleted', { messageId: data.messageId })

        const index = messages.value.findIndex(m => m.id === data.messageId)
        if (index > -1) {
            messages.value.splice(index, 1)
        }
    }

    const handleTypingIndicator = (data: {
        roomId: string;
        userId: string;
        userName: string;
        isTyping: boolean
    }) => {
        if (!roomStore.currentRoom || data.roomId !== roomStore.currentRoom.id) {
            return
        }

        // Don't show typing indicator for current user
        if (data.userId === roomStore.currentParticipant?.socketId) {
            return
        }

        if (data.isTyping) {
            typingUsers.value.add(data.userName)
        } else {
            typingUsers.value.delete(data.userName)
        }

        log('info', 'Typing indicator updated', {
            userName: data.userName,
            isTyping: data.isTyping
        })
    }

    const handleReactionAdded = (data: {
        roomId: string;
        messageId: string;
        reaction: MessageReaction
    }) => {
        const message = messages.value.find(m => m.id === data.messageId)
        if (message) {
            if (!message.reactions) {
                message.reactions = []
            }

            const existingReaction = message.reactions.find(r => r.emoji === data.reaction.emoji)
            if (existingReaction) {
                existingReaction.count = data.reaction.count
                existingReaction.userIds = data.reaction.userIds
            } else {
                message.reactions.push(data.reaction)
            }
        }
    }

    const handleReactionRemoved = (data: {
        roomId: string;
        messageId: string;
        emoji: string;
        userId: string
    }) => {
        const message = messages.value.find(m => m.id === data.messageId)
        if (message?.reactions) {
            const reactionIndex = message.reactions.findIndex(r => r.emoji === data.emoji)
            if (reactionIndex > -1) {
                const reaction = message.reactions[reactionIndex]
                reaction.userIds = reaction.userIds.filter(id => id !== data.userId)
                reaction.count = reaction.userIds.length

                if (reaction.count === 0) {
                    message.reactions.splice(reactionIndex, 1)
                }
            }
        }
    }

    const handleChatHistory = (data: { roomId: string; messages: ChatMessage[] }) => {
        log('info', 'Chat history received', { messageCount: data.messages.length })

        messages.value = data.messages.sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
    }

    const handleSystemMessage = (message: ChatMessage) => {
        log('info', 'System message received', { type: message.type })
        messages.value.push(message)
    }

    // Initialize socket listeners (SSR-safe)
    const setupSocketListeners = () => {
        if (!process.client) return

        log('info', 'Setting up chat socket listeners')

        socketStore.on('chat-message', handleIncomingMessage)
        socketStore.on('chat-message-edited', handleMessageEdited)
        socketStore.on('chat-message-deleted', handleMessageDeleted)
        socketStore.on('chat-typing', handleTypingIndicator)
        socketStore.on('chat-reaction-added', handleReactionAdded)
        socketStore.on('chat-reaction-removed', handleReactionRemoved)
        socketStore.on('chat-history', handleChatHistory)
        socketStore.on('chat-system-message', handleSystemMessage)

        isInitialized.value = true
        log('info', 'Chat socket listeners configured')
    }

    // Actions
    const initializeChat = async () => {
        if (isInitialized.value || !process.client) {
            return
        }

        log('info', 'Initializing chat store')

        try {
            setupSocketListeners()
        } catch (error) {
            log('error', 'Failed to initialize chat', error)
            setChatError('Failed to initialize chat')
            throw error
        }
    }

    const sendMessage = async (content: string, type: 'text' | 'emoji' = 'text') => {
        if (!content.trim()) {
            const errorMsg = 'Message content cannot be empty'
            setChatError(errorMsg)
            throw new Error(errorMsg)
        }

        if (!roomStore.currentRoom) {
            const errorMsg = 'Must be in a room to send messages'
            setChatError(errorMsg)
            throw new Error(errorMsg)
        }

        if (!isInitialized.value) {
            await initializeChat()
        }

        isSendingMessage.value = true
        clearError()

        log('info', 'Sending message', { content, type, roomId: roomStore.currentRoom.id })

        try {
            const request: SendMessageRequest = {
                roomId: roomStore.currentRoom.id,
                content: content.trim(),
                type
            }

            // Fixed: Remove type argument from emit call
            const response = await socketStore.emit('send-message', request) as SendMessageResponse

            if (response.success) {
                log('info', 'Message sent successfully', { messageId: response.message.id })
            } else {
                throw new Error('Failed to send message')
            }
        } catch (error) {
            const errorMessage = (error as Error).message
            setChatError(`Failed to send message: ${errorMessage}`)
            throw error
        } finally {
            isSendingMessage.value = false
        }
    }

    const editMessage = async (messageId: string, newContent: string) => {
        if (!roomStore.currentRoom) {
            throw new Error('Must be in a room to edit messages')
        }

        try {
            const request: EditMessageRequest = {
                roomId: roomStore.currentRoom.id,
                messageId,
                newContent: newContent.trim()
            }

            // Fixed: Remove type argument from emit call
            const response = await socketStore.emit('edit-message', request) as EditMessageResponse

            if (response.success) {
                log('info', 'Message edited successfully', { messageId })
            } else {
                throw new Error('Failed to edit message')
            }
        } catch (error) {
            log('error', 'Failed to edit message', error)
            throw error
        }
    }

    const deleteMessage = async (messageId: string) => {
        if (!roomStore.currentRoom) {
            throw new Error('Must be in a room to delete messages')
        }

        try {
            const request: DeleteMessageRequest = {
                roomId: roomStore.currentRoom.id,
                messageId
            }

            // Fixed: Remove type argument from emit call
            const response = await socketStore.emit('delete-message', request) as DeleteMessageResponse

            if (response.success) {
                log('info', 'Message deleted successfully', { messageId })
            } else {
                throw new Error('Failed to delete message')
            }
        } catch (error) {
            log('error', 'Failed to delete message', error)
            throw error
        }
    }

    const sendTypingIndicator = async (isTyping: boolean) => {
        if (!roomStore.currentRoom || !roomStore.currentParticipant) return

        try {
            const request: TypingIndicatorRequest = {
                roomId: roomStore.currentRoom.id,
                isTyping
            }

            await socketStore.emit('typing-indicator', request)
        } catch (error) {
            log('warning', 'Failed to send typing indicator', error)
        }
    }

    const addReaction = async (messageId: string, emoji: string) => {
        if (!roomStore.currentRoom) {
            throw new Error('Must be in a room to add reactions')
        }

        try {
            const request: AddReactionRequest = {
                roomId: roomStore.currentRoom.id,
                messageId,
                emoji
            }

            await socketStore.emit('add-reaction', request)
        } catch (error) {
            log('error', 'Failed to add reaction', error)
            throw error
        }
    }

    const removeReaction = async (messageId: string, emoji: string) => {
        if (!roomStore.currentRoom) {
            throw new Error('Must be in a room to remove reactions')
        }

        try {
            const request: RemoveReactionRequest = {
                roomId: roomStore.currentRoom.id,
                messageId,
                emoji
            }

            await socketStore.emit('remove-reaction', request)
        } catch (error) {
            log('error', 'Failed to remove reaction', error)
            throw error
        }
    }

    const loadChatHistory = async () => {
        if (!roomStore.currentRoom) {
            throw new Error('Must be in a room to load chat history')
        }

        isLoading.value = true
        log('info', 'Loading chat history', { roomId: roomStore.currentRoom.id })

        try {
            // Fixed: Remove type argument from emit call
            const response = await socketStore.emit('get-chat-history', {
                roomId: roomStore.currentRoom.id
            }) as { success: boolean; messages: ChatMessage[]; error?: string }

            if (response.success) {
                handleChatHistory({ roomId: roomStore.currentRoom.id, messages: response.messages })
                log('info', 'Chat history loaded', { messageCount: response.messages.length })
            } else {
                throw new Error(response.error || 'Failed to load chat history')
            }
        } catch (error) {
            const errorMessage = (error as Error).message
            setChatError(`Failed to load chat history: ${errorMessage}`)
            throw error
        } finally {
            isLoading.value = false
        }
    }

    const clearMessages = () => {
        messages.value = []
        typingUsers.value.clear()
        clearError()
        log('info', 'Chat messages cleared')
    }

    // Helper methods for components
    const canEditMessage = (message: ChatMessage): boolean => {
        return message.senderId === roomStore.currentParticipant?.socketId
    }

    const canDeleteMessage = (message: ChatMessage): boolean => {
        return message.senderId === roomStore.currentParticipant?.socketId ||
            roomStore.isRoomCreator
    }

    const isMentioned = (message: ChatMessage): boolean | undefined => {
        const currentUserId = roomStore.currentParticipant?.socketId

        if (currentUserId !== undefined) {
            return message.mentions?.includes(currentUserId)
        }

        return false
    }

    const hasUserReacted = (message: ChatMessage, emoji: string): boolean | undefined => {
        const currentUserId = roomStore.currentParticipant?.socketId
        const reaction = message.reactions?.find(r => r.emoji === emoji)

        if (currentUserId !== undefined && reaction) {
            return reaction.userIds.includes(currentUserId)
        }

        return false
    }

    return {
        // State
        messages: readonly(messages),
        participants: readonly(participants),
        typingUsers: readonly(typingUsers),
        isLoading: readonly(isLoading),
        error: readonly(error),
        isSendingMessage: readonly(isSendingMessage),
        isInitialized: readonly(isInitialized),

        // Computed
        messageCount,
        hasMessages,
        typingUserNames,
        canSendMessage,

        // Actions
        initializeChat,
        sendMessage,
        editMessage,
        deleteMessage,
        sendTypingIndicator,
        addReaction,
        removeReaction,
        loadChatHistory,
        clearMessages,

        // Helper methods
        canEditMessage,
        canDeleteMessage,
        isMentioned,
        hasUserReacted,
        clearError
    }
})