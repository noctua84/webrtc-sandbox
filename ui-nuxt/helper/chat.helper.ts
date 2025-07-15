// ui-nuxt/utils/chat.helpers.ts

import type { ChatMessage, SystemMessageType, SystemMessageData } from '~/types/chat.types'

/**
 * Creates a system message for room events
 */
export const createSystemMessage = (
    roomId: string,
    type: SystemMessageType,
    data: SystemMessageData
): ChatMessage => {
    const messageContent = formatSystemMessage(type, data)

    return {
        id: `system-${Date.now()}-${Math.random()}`,
        roomId,
        senderId: 'system',
        senderName: 'System',
        content: messageContent,
        timestamp: new Date().toISOString(),
        type: 'system'
    }
}

/**
 * Formats system message content based on event type
 */
export const formatSystemMessage = (type: SystemMessageType, data: SystemMessageData): string => {
    switch (type) {
        case 'participant-joined':
            return data.isHost
                ? `${data.userName} (Host) joined the room`
                : `${data.userName} joined the room`

        case 'participant-left':
            return data.isHost
                ? `${data.userName} (Host) left the room`
                : `${data.userName} left the room`

        case 'host-joined':
            return `${data.userName} joined as host`

        case 'host-left':
            return `Host ${data.userName} left the room`

        case 'host-changed':
            const previousHost = data.metadata?.previousHost
            return previousHost
                ? `${data.userName} is now the host (was ${previousHost})`
                : `${data.userName} is now the host`

        case 'room-created':
            return `Room created by ${data.userName}`

        default:
            return 'Room event occurred'
    }
}

/**
 * Parses @mentions from message content
 */
export const parseMentions = (content: string, participants: Array<{ userName: string; socketId: string }>): string[] => {
    const mentionRegex = /@(\w+)/g
    const mentions: string[] = []
    let match

    while ((match = mentionRegex.exec(content)) !== null) {
        const username = match[1]
        const participant = participants.find(p =>
            p.userName.toLowerCase() === username.toLowerCase()
        )

        if (participant) {
            mentions.push(participant.socketId)
        }
    }

    return mentions
}

/**
 * Highlights @mentions in message content for display
 */
export const highlightMentions = (
    content: string,
    participants: Array<{ userName: string; socketId: string }>
): string => {
    return content.replace(/@(\w+)/g, (match, username) => {
        const participant = participants.find(p =>
            p.userName.toLowerCase() === username.toLowerCase()
        )

        if (participant) {
            return `<span class="mention">@${username}</span>`
        }

        return match
    })
}

/**
 * Validates message content
 */
export const validateMessage = (content: string): { isValid: boolean; error?: string } => {
    if (!content || !content.trim()) {
        return { isValid: false, error: 'Message cannot be empty' }
    }

    if (content.length > 1000) {
        return { isValid: false, error: 'Message cannot exceed 1000 characters' }
    }

    return { isValid: true }
}

/**
 * Formats timestamp for display
 */
export const formatMessageTime = (timestamp: string): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

    if (diffInHours < 24) {
        // Same day - show time only
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffInHours < 48) {
        // Yesterday
        return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    } else {
        // Older - show date and time
        return date.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }
}

/**
 * Generates user initials for avatars
 */
export const getUserInitials = (userName: string): string => {
    const words = userName.trim().split(' ')

    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase()
    }

    return userName.slice(0, 2).toUpperCase() || '??'
}

/**
 * Throttle function for typing indicators
 */
export const createTypingThrottle = (fn: Function, delay: number) => {
    let timeoutId: NodeJS.Timeout | null = null
    let lastExecuted = 0

    return (...args: any[]) => {
        const now = Date.now()

        if (now - lastExecuted >= delay) {
            fn(...args)
            lastExecuted = now
        } else {
            if (timeoutId) clearTimeout(timeoutId)
            timeoutId = setTimeout(() => {
                fn(...args)
                lastExecuted = Date.now()
            }, delay - (now - lastExecuted))
        }
    }
}

/**
 * Debounce function for search/filtering
 */
export const createDebounce = (fn: Function, delay: number) => {
    let timeoutId: NodeJS.Timeout | null = null

    return (...args: any[]) => {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(() => fn(...args), delay)
    }
}

/**
 * Sanitizes message content to prevent XSS
 */
export const sanitizeMessageContent = (content: string): string => {
    return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
}

/**
 * Checks if user is mentioned in a message
 */
export const isUserMentioned = (
    message: ChatMessage,
    userId: string,
    participants: Array<{ userName: string; socketId: string }>
): boolean => {
    // Check if directly mentioned by ID
    if (message.mentions?.includes(userId)) {
        return true
    }

    // Check if mentioned by username in content
    const user = participants.find(p => p.socketId === userId)
    if (!user) return false

    const mentionRegex = new RegExp(`@${user.userName}\\b`, 'i')
    return mentionRegex.test(message.content)
}

/**
 * Groups messages by date for display
 */
export const groupMessagesByDate = (messages: ChatMessage[]): Array<{
    date: string
    messages: ChatMessage[]
}> => {
    const groups: { [key: string]: ChatMessage[] } = {}

    messages.forEach(message => {
        const date = new Date(message.timestamp).toDateString()
        if (!groups[date]) {
            groups[date] = []
        }
        groups[date].push(message)
    })

    return Object.entries(groups).map(([date, msgs]) => ({
        date,
        messages: msgs
    }))
}

/**
 * Formats date for group headers
 */
export const formatDateHeader = (dateString: string): string => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
        return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday'
    } else {
        return date.toLocaleDateString([], {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }
}

/**
 * Checks if messages should be grouped together (same sender, close in time)
 */
export const shouldGroupMessages = (
    current: ChatMessage,
    previous: ChatMessage | null
): boolean => {
    if (!previous) return false
    if (current.senderId !== previous.senderId) return false
    if (current.type === 'system' || previous.type === 'system') return false

    const timeDiff = new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime()
    const fiveMinutes = 5 * 60 * 1000

    return timeDiff < fiveMinutes
}

/**
 * Creates a unique key for message reactions
 */
export const createReactionKey = (messageId: string, emoji: string): string => {
    return `${messageId}-${emoji}`
}

/**
 * Sorts reactions by count (descending) and emoji (ascending)
 */
export const sortReactions = (reactions: Array<{ emoji: string; count: number }>) => {
    return reactions.sort((a, b) => {
        if (a.count !== b.count) {
            return b.count - a.count // Higher counts first
        }
        return a.emoji.localeCompare(b.emoji) // Alphabetical by emoji
    })
}