// ui/src/components/Chat/ChatInput.tsx - Enhanced with @mention support

import React, { useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import chatStore from '@/stores/chat.store';
import roomStore from '@/stores/room.store';

const ChatInput: React.FC = observer(() => {
    const [message, setMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [showMentions, setShowMentions] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionPosition, setMentionPosition] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [message]);

    // Handle mention detection
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        const cursorPosition = e.target.selectionStart;

        setMessage(value);

        // Check for @ mentions
        const beforeCursor = value.substring(0, cursorPosition);
        const mentionMatch = beforeCursor.match(/@(\w*)$/);

        if (mentionMatch && mentionMatch[1]) {
            setShowMentions(true);
            setMentionQuery(mentionMatch[1].toLowerCase());
            setMentionPosition(cursorPosition - mentionMatch[1].length - 1);
        } else {
            setShowMentions(false);
            setMentionQuery('');
        }

        // Handle typing indicators
        if (value.trim() && !isTyping) {
            setIsTyping(true);
            chatStore.sendTypingIndicator(true);
        }

        // Clear existing timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        // Set new timeout to stop typing indicator
        typingTimeoutRef.current = setTimeout(() => {
            if (isTyping) {
                setIsTyping(false);
                chatStore.sendTypingIndicator(false);
            }
        }, 1000);
    };

    // Handle mention selection
    const selectMention = (username: string) => {
        if (!textareaRef.current) return;

        const beforeMention = message.substring(0, mentionPosition);
        const afterMention = message.substring(textareaRef.current.selectionStart);
        const newMessage = `${beforeMention}@${username} ${afterMention}`;

        setMessage(newMessage);
        setShowMentions(false);
        setMentionQuery('');

        // Focus back to textarea
        setTimeout(() => {
            if (textareaRef.current) {
                const newCursorPosition = mentionPosition + username.length + 2;
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
            }
        }, 0);
    };

    const handleSend = async () => {
        if (!message.trim() || !chatStore.canSendMessage) return;

        const messageToSend = message.trim();
        setMessage('');

        // Stop typing indicator
        if (isTyping) {
            setIsTyping(false);
            chatStore.sendTypingIndicator(false);
        }

        try {
            await chatStore.sendMessage(messageToSend);
        } catch (error) {
            console.error('Failed to send message:', error);
            alert('Failed to send message');
            // Restore message on error
            setMessage(messageToSend);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (showMentions) {
            // Handle mention navigation
            if (e.key === 'Escape') {
                setShowMentions(false);
                setMentionQuery('');
                return;
            }
            // You could add arrow key navigation here
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleEmojiClick = (emoji: string) => {
        const newMessage = message + emoji;
        setMessage(newMessage);
        textareaRef.current?.focus();
    };

    // Filter participants for mentions
    const mentionCandidates = roomStore.participants.filter(participant => {
        if (participant.socketId === roomStore.currentParticipant?.socketId) return false; // Don't mention self
        return participant.userName.toLowerCase().includes(mentionQuery);
    });

    const quickEmojis = ['👍', '👎', '😀', '😂', '❤️', '🎉', '👏', '🔥'];

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            if (isTyping) {
                chatStore.sendTypingIndicator(false);
            }
        };
    }, [isTyping]);

    if (!chatStore.canSendMessage) {
        return (
            <div className="p-3 text-center text-gray-500 text-sm">
                Chat is not available
            </div>
        );
    }

    return (
        <div className="p-3 space-y-2 relative">
            {/* Mention Dropdown */}
            {showMentions && mentionCandidates.length > 0 && (
                <div className="absolute bottom-full left-3 right-3 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto z-10">
                    <div className="p-2 text-xs text-gray-500 border-b">
                        Type to mention someone:
                    </div>
                    {mentionCandidates.slice(0, 5).map((participant) => (
                        <button
                            key={participant.socketId}
                            onClick={() => selectMention(participant.userName)}
                            className="w-full flex items-center gap-2 p-2 hover:bg-gray-100 text-left"
                        >
                            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                                {participant.userName.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm">{participant.userName}</span>
                            {participant.isCreator && (
                                <span className="text-xs text-blue-600 bg-blue-100 px-1 rounded">host</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Quick Emojis */}
            <div className="flex gap-1 flex-wrap">
                {quickEmojis.map((emoji) => (
                    <button
                        key={emoji}
                        onClick={() => handleEmojiClick(emoji)}
                        className="p-1 hover:bg-gray-100 rounded text-lg leading-none"
                        type="button"
                    >
                        {emoji}
                    </button>
                ))}
            </div>

            {/* Input Area */}
            <div className="flex gap-2 items-end">
                <div className="flex-1 relative">
          <textarea
              ref={textareaRef}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (@username to mention, Enter to send, Shift+Enter for new line)"
              className="w-full p-2 pr-10 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={1}
              style={{ minHeight: '40px', maxHeight: '120px' }}
          />

                    {/* Character Count */}
                    <div className="absolute bottom-1 right-2 text-xs text-gray-400">
                        {message.length}/1000
                    </div>
                </div>

                {/* Send Button */}
                <button
                    onClick={handleSend}
                    disabled={!message.trim() || message.length > 1000}
                    className={`p-2 rounded-lg transition-colors ${
                        message.trim() && message.length <= 1000
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    type="button"
                >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                    </svg>
                </button>
            </div>

            {/* Mention hint */}
            {showMentions && mentionCandidates.length === 0 && mentionQuery && (
                <div className="text-xs text-gray-500">
                    No participants found matching "{mentionQuery}"
                </div>
            )}

            {/* Message Validation */}
            {message.length > 1000 && (
                <p className="text-xs text-red-600">
                    Message is too long ({message.length}/1000 characters)
                </p>
            )}

            {/* Mention help hint */}
            {message.includes('@') && !showMentions && (
                <div className="text-xs text-gray-500">
                    💡 Tip: Type @username to mention someone in the room
                </div>
            )}
        </div>
    );
});

export default ChatInput;