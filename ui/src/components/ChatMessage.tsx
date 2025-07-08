// ui/src/components/Chat/ChatMessage.tsx - Fixed reaction positioning and self-reaction

import React, { useState } from 'react';
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

    const isOwnMessage = message.senderId === roomStore.currentParticipant?.socketId;
    const canEdit = chatStore.canEditMessage(message);
    const isMentioned = chatStore.isMentioned(message);

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
        <div className={`flex gap-3 group ${isOwnMessage ? 'flex-row-reverse' : ''} ${
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

                {/* Message Body Container - FIXED: Proper positioning context */}
                <div className="relative">
                    {isEditing ? (
                        <div className="space-y-2">
              <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full p-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  autoFocus
                  onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleEdit();
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

                            {/* FIXED: Reactions positioned directly below message bubble */}
                            {message.reactions && message.reactions.length > 0 && (
                                <div className={`flex flex-wrap gap-1 mt-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                                    {message.reactions.map((reaction: any) => (
                                        <button
                                            key={reaction.emoji}
                                            onClick={() => handleReaction(reaction.emoji)}
                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                                                chatStore.hasUserReacted(message, reaction.emoji)
                                                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                        >
                                            <span>{reaction.emoji}</span>
                                            <span>{reaction.count}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Message Actions - FIXED: Better positioning and self-reaction prevention */}
                    {!isEditing && !isOwnMessage && ( /* FIXED: Don't show actions on own messages for reactions */
                        <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex gap-1">
                                {/* Reaction Button */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowReactions(!showReactions)}
                                        className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center"
                                    >
                                        <span className="text-xs">😊</span>
                                    </button>

                                    {/* FIXED: Better positioned reaction dropdown */}
                                    {showReactions && (
                                        <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-20">
                                            <div className="grid grid-cols-4 gap-1">
                                                {QUICK_REACTIONS.map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => handleReaction(emoji)}
                                                        className="w-8 h-8 text-lg hover:bg-gray-100 rounded flex items-center justify-center transition-colors"
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* FIXED: Separate menu for own messages (edit/delete only) */}
                    {!isEditing && canEdit && (
                        <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="relative">
                                <button
                                    onClick={() => setShowMenu(!showMenu)}
                                    className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center"
                                >
                                    <svg className="w-3 h-3 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                    </svg>
                                </button>

                                {showMenu && (
                                    <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                                        <button
                                            onClick={() => {
                                                setIsEditing(true);
                                                setShowMenu(false);
                                            }}
                                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 first:rounded-t-lg"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 last:rounded-b-lg"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Reply indicator */}
                {message.replyTo && (
                    <div className={`mt-1 text-xs text-gray-500 ${isOwnMessage ? 'text-right' : ''}`}>
                        <span>↳ Replying to message</span>
                    </div>
                )}
            </div>
        </div>
    );
});

export default ChatMessage;