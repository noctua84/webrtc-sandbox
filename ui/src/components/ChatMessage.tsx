// ui/src/components/Chat/ChatMessage.tsx - Fixed emoji selection display

import React, { useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import chatStore from '@/stores/chat.store';
import roomStore from '@/stores/room.store';
import type { ChatMessage } from '@/types/chat.types';

interface ChatMessageProps {
    message: ChatMessage;
}

const QUICK_REACTIONS = ['👍', '👎', '😀', '😂', '❤️', '🎉', '🔥', '💯'];

const ChatMessage: React.FC<ChatMessageProps> = observer(({ message }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(message.content);
    const [showMenu, setShowMenu] = useState(false);
    const [showReactions, setShowReactions] = useState(false);

    // Refs for click outside detection
    const reactionDropdownRef = useRef<HTMLDivElement>(null);
    const menuDropdownRef = useRef<HTMLDivElement>(null);

    const isOwnMessage = message.senderId === roomStore.currentParticipant?.socketId;
    const canEdit = chatStore.canEditMessage(message);
    const isMentioned = chatStore.isMentioned(message);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (reactionDropdownRef.current && !reactionDropdownRef.current.contains(event.target as Node)) {
                setShowReactions(false);
            }
            if (menuDropdownRef.current && !menuDropdownRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleEdit = async () => {
        if (!editContent.trim() || editContent === message.content) {
            setIsEditing(false);
            return;
        }

        try {
            await chatStore.editMessage(message.id, editContent);
            setIsEditing(false);
            setShowMenu(false);
        } catch (error) {
            console.error('Failed to edit message:', error);
            alert('Failed to edit message');
        }
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this message?')) return;

        try {
            await chatStore.deleteMessage(message.id);
            setShowMenu(false);
        } catch (error) {
            console.error('Failed to delete message:', error);
            alert('Failed to delete message');
        }
    };

    const handleReaction = async (emoji: string) => {
        try {
            const hasReacted = chatStore.hasUserReacted(message, emoji);
            if (hasReacted) {
                await chatStore.removeReaction(message.id, emoji);
            } else {
                await chatStore.addReaction(message.id, emoji);
            }
            setShowReactions(false);
        } catch (error) {
            console.error('Failed to toggle reaction:', error);
        }
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderMentions = (content: string) => {
        const mentionRegex = /@(\w+)/g;
        const parts = content.split(mentionRegex);

        return parts.map((part, index) => {
            if (index % 2 === 1) { // This is a username
                const participant = roomStore.participants.find(p =>
                    p.userName.toLowerCase() === part.toLowerCase()
                );
                if (participant) {
                    return (
                        <span
                            key={index}
                            className="bg-blue-100 text-blue-800 px-1 rounded font-medium"
                        >
                            @{part}
                        </span>
                    );
                }
            }
            return part;
        });
    };

    // System message rendering
    if (message.type === 'system') {
        return (
            <div className="flex justify-center my-2">
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                    <div className="w-3 h-3 text-gray-400">
                        <svg fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <span>{message.content}</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex gap-3 group relative ${isOwnMessage ? 'flex-row-reverse' : ''} ${
            isMentioned ? 'bg-blue-50 border-l-4 border-blue-400 pl-3 py-2 rounded-r-lg' : ''
        }`}>
            {/* Avatar */}
            <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                    {message.senderName.charAt(0).toUpperCase()}
                </div>
            </div>

            {/* Message Content */}
            <div className={`flex-1 max-w-xs ${isOwnMessage ? 'text-right' : ''}`}>
                {/* Header */}
                <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                    <span className="text-sm font-medium text-gray-900">
                        {isOwnMessage ? 'You' : message.senderName}
                    </span>
                    <span className="text-xs text-gray-500">
                        {formatTime(message.timestamp)}
                    </span>
                    {message.edited && (
                        <span className="text-xs text-gray-400 italic">
                            (edited)
                        </span>
                    )}
                </div>

                {/* Message Body Container */}
                <div className="relative">
                    {isEditing ? (
                        <div className="space-y-2">
                            <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="w-full p-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows={2}
                                autoFocus
                                onKeyDown={async (e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        await handleEdit();
                                    } else if (e.key === 'Escape') {
                                        setIsEditing(false);
                                        setEditContent(message.content);
                                    }
                                }}
                            />
                            <div className="flex gap-2 justify-end">
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditContent(message.content);
                                    }}
                                    className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleEdit}
                                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Message Bubble */}
                            <div className={`inline-block p-3 rounded-lg max-w-full break-words ${
                                isOwnMessage
                                    ? 'bg-blue-600 text-white'
                                    : isMentioned
                                        ? 'bg-blue-100 text-gray-900 border border-blue-200'
                                        : 'bg-gray-100 text-gray-900'
                            }`}>
                                <div className="text-sm whitespace-pre-wrap">
                                    {renderMentions(message.content)}
                                </div>
                            </div>

                            {/* Reactions positioned below message bubble */}
                            {message.reactions && message.reactions.length > 0 && (
                                <div className={`flex flex-wrap gap-1 mt-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                                    {message.reactions.map((reaction: any) => (
                                        <button
                                            key={reaction.emoji}
                                            onClick={() => !isOwnMessage && handleReaction(reaction.emoji)}
                                            disabled={isOwnMessage}
                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                                                isOwnMessage
                                                    ? 'bg-gray-50 text-gray-500 cursor-default'
                                                    : chatStore.hasUserReacted(message, reaction.emoji)
                                                        ? 'bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-50'
                                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                            title={isOwnMessage ? 'Cannot react to your own message' : undefined}
                                        >
                                            <span>{reaction.emoji}</span>
                                            <span>{reaction.count}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Message Actions - Positioned at corners of message bubble */}
                    {!isEditing && (
                        <div className={`absolute -top-2 ${isOwnMessage ? '-left-2' : '-right-2'} opacity-0 group-hover:opacity-100 transition-opacity`}>
                            {/* Show reaction button for others' messages */}
                            {!isOwnMessage && (
                                <div className="relative" ref={reactionDropdownRef}>
                                    <button
                                        onClick={() => {
                                            setShowReactions(!showReactions);
                                            setShowMenu(false);
                                        }}
                                        className="w-6 h-6 bg-white border border-gray-200 hover:bg-gray-50 rounded-full flex items-center justify-center shadow-sm"
                                        title="Add reaction"
                                    >
                                        <span className="text-xs">😊</span>
                                    </button>

                                    {/* Emoji Selection Dropdown */}
                                    {showReactions && (
                                        <div className={`absolute top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 min-w-max ${
                                            isOwnMessage ? 'left-0' : 'right-0'
                                        }`}>
                                            <div className="grid grid-cols-4 gap-1">
                                                {QUICK_REACTIONS.map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => handleReaction(emoji)}
                                                        className="w-8 h-8 text-lg hover:bg-gray-100 rounded flex items-center justify-center transition-colors"
                                                        title={`React with ${emoji}`}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Show edit/delete menu for own messages */}
                            {canEdit && (
                                <div className="relative" ref={menuDropdownRef}>
                                    <button
                                        onClick={() => {
                                            setShowMenu(!showMenu);
                                            setShowReactions(false);
                                        }}
                                        className="w-6 h-6 bg-white border border-gray-200 hover:bg-gray-50 rounded-full flex items-center justify-center shadow-sm"
                                        title="Message options"
                                    >
                                        <svg className="w-3 h-3 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                        </svg>
                                    </button>

                                    {/* Edit/Delete Dropdown */}
                                    {showMenu && (
                                        <div className={`absolute top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-max ${
                                            isOwnMessage ? 'left-0' : 'right-0'
                                        }`}>
                                            <button
                                                onClick={() => {
                                                    setIsEditing(true);
                                                    setShowMenu(false);
                                                }}
                                                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                                            >
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                </svg>
                                                Edit
                                            </button>
                                            <button
                                                onClick={handleDelete}
                                                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                            >
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                                Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default ChatMessage;