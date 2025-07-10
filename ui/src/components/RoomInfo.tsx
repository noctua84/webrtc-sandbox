import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import roomStore from '../stores/room.store';

const RoomInfo: React.FC = observer(() => {
    const [showRoomId, setShowRoomId] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);
    const [showLeaveDialog, setShowLeaveDialog] = useState<boolean>(false);
    const [isLeavingRoom, setIsLeavingRoom] = useState<boolean>(false);
    const [copyError, setCopyError] = useState<string | null>(null);

    if (!roomStore.isInRoom || !roomStore.currentRoom || !roomStore.currentParticipant) {
        return null;
    }

    const handleCopyRoomId = async (): Promise<void> => {
        try {
            setCopyError(null);

            // Try modern Clipboard API first
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(roomStore.currentRoom!.id);
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = roomStore.currentRoom!.id;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }

            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy room ID:', error);
            setCopyError('Failed to copy room ID. Please copy manually.');
            setTimeout(() => setCopyError(null), 3000);
        }
    };;

    const handleLeaveRoom = (): void => {
        setShowLeaveDialog(true);
    };

    const confirmLeaveRoom = async (): Promise<void> => {
        try {
            setIsLeavingRoom(true);
            await roomStore.leaveRoom();
            setShowLeaveDialog(false);
        } catch (error) {
            console.error('Error leaving room:', error);
            // Error is already logged in the store and shown in the UI
        } finally {
            setIsLeavingRoom(false);
        }
    };

    const cancelLeaveRoom = (): void => {
        setShowLeaveDialog(false);
    };

    const formatTimeAgo = (dateString: string): string => {
        const now = new Date();
        const date = new Date(dateString);
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) {
            return 'just now';
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        } else {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        }
    };

    const formatDate = (dateString: string): string => {
        return new Date(dateString).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const getMediaStatusIcon = (mediaStatus: any, type: 'video' | 'audio' | 'screen') => {
        if (!mediaStatus) return null;

        switch (type) {
            case 'video':
                return mediaStatus.hasVideo ? '🎥' : '📷';
            case 'audio':
                return mediaStatus.hasAudio ? '🎤' : '🔇';
            case 'screen':
                return mediaStatus.isScreenSharing ? '🖥️' : null;
            default:
                return null;
        }
    };

    // Type guard to ensure currentRoom exists
    if (!roomStore.currentRoom || !roomStore.currentParticipant) {
        return null;
    }

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                        <span className="text-primary-600 text-lg">🏠</span>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800">
                        Current Room
                    </h2>
                </div>
                <button
                    onClick={handleLeaveRoom}
                    disabled={isLeavingRoom}
                    className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    aria-label="Leave room"
                >
                    {isLeavingRoom ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Leaving...
                        </>
                    ) : (
                        <>
                            <span>🚪</span>
                            Leave Room
                        </>
                    )}
                </button>
            </div>

            {/* Room ID Section - Host Only */}
            {roomStore.isRoomCreator && (
                <div className="mb-6 p-4 bg-primary-50 border border-primary-200 rounded-lg">
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center mt-1">
                            <span className="text-primary-600">📤</span>
                        </div>
                        <div className="flex-1">
                            <h4 className="text-sm font-medium text-primary-800 mb-1 flex items-center gap-2">
                                <span>👑</span>
                                Invite Others
                            </h4>
                            <p className="text-sm text-primary-700 mb-3">
                                Share this room ID with others so they can join:
                            </p>
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <code className="block text-sm font-mono bg-white px-3 py-2 rounded border border-primary-300 font-medium select-all">
                                        {showRoomId ? roomStore.currentRoom.id : '••••••••••••'}
                                    </code>
                                    <button
                                        onClick={() => setShowRoomId(!showRoomId)}
                                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-primary-600 hover:text-primary-800 underline"
                                        aria-label={showRoomId ? 'Hide room ID' : 'Show room ID'}
                                    >
                                        {showRoomId ? '👁️‍🗨️ Hide' : '👁️ Show'}
                                    </button>
                                </div>
                                <button
                                    onClick={handleCopyRoomId}
                                    disabled={copied}
                                    className="px-4 py-2 bg-primary-500 text-white text-sm rounded hover:bg-primary-600 transition-colors disabled:bg-green-500 disabled:cursor-default flex items-center gap-2 min-w-[100px] justify-center"
                                    aria-label="Copy room ID to clipboard"
                                >
                                    {copied ? (
                                        <>
                                            <span>✅</span>
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <span>📋</span>
                                            Copy ID
                                        </>
                                    )}
                                </button>
                            </div>
                            {copyError && (
                                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center gap-2">
                                    <span>⚠️</span>
                                    {copyError}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Room Details */}
            <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Your Role */}
                    <div className="p-4 bg-gray-50 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{roomStore.isRoomCreator ? '👑' : '👤'}</span>
                            <label className="text-sm font-medium text-gray-600">Your Role</label>
                        </div>
                        <p className="text-sm font-medium">
                            {roomStore.isRoomCreator ? (
                                <span className="text-primary-600 flex items-center gap-1">
                                    <span>🌟</span>
                                    Room Creator
                                </span>
                            ) : (
                                <span className="text-gray-700 flex items-center gap-1">
                                    <span>🤝</span>
                                    Participant
                                </span>
                            )}
                        </p>
                    </div>

                    {/* Participants Count */}
                    <div className="p-4 bg-gray-50 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">👥</span>
                            <label className="text-sm font-medium text-gray-600">Participants</label>
                        </div>
                        <p className="text-sm">
                            <span className="font-medium text-green-600">{roomStore.connectedParticipantCount}</span>
                            <span className="text-gray-500"> / {roomStore.currentRoom.maxParticipants} connected</span>
                            {roomStore.participantCount !== roomStore.connectedParticipantCount && (
                                <span className="text-gray-500 block text-xs">({roomStore.participantCount} total)</span>
                            )}
                        </p>
                    </div>
                </div>

                {/* Created Date */}
                <div className="p-4 bg-gray-50 rounded-lg border">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🕐</span>
                        <label className="text-sm font-medium text-gray-600">Created</label>
                    </div>
                    <p className="text-sm text-gray-700 font-medium">
                        {formatDate(roomStore.currentRoom.createdAt)}
                    </p>
                </div>
            </div>

            {/* Enhanced Participants List */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-800 flex items-center gap-2">
                        <span>👥</span>
                        Participants
                    </h3>
                    <div className="flex items-center gap-2">
                        <div className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full font-medium">
                            {roomStore.connectedParticipantCount} connected
                        </div>
                        {roomStore.participantCount !== roomStore.connectedParticipantCount && (
                            <div className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full font-medium">
                                {roomStore.participantCount - roomStore.connectedParticipantCount} offline
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-3">
                    {roomStore.participants.map((participant) => (
                        <div
                            key={participant.socketId || `disconnected-${participant.userName}`}
                            className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all duration-200 hover:shadow-md ${
                                participant.isConnected
                                    ? 'bg-gray-50 border-gray-200 hover:border-gray-300'
                                    : 'bg-yellow-50 border-yellow-200 hover:border-yellow-300'
                            }`}
                        >
                            <div className="flex items-center gap-4">
                                {/* Enhanced Avatar */}
                                <div className="relative">
                                    <div className={`w-10 h-10 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-md ${
                                        participant.isConnected ? 'bg-primary-500' : 'bg-gray-400'
                                    }`}>
                                        {participant.userName.charAt(0).toUpperCase()}
                                    </div>
                                    {/* Connection Status Dot */}
                                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-white rounded-full ${
                                        participant.isConnected ? 'bg-green-500' : 'bg-yellow-500'
                                    }`}></div>
                                </div>

                                {/* Enhanced Participant Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <p className="text-sm font-semibold text-gray-800 truncate">
                                            {participant.userName}
                                        </p>

                                        {/* Enhanced Badges */}
                                        {participant.socketId === roomStore.currentParticipant?.socketId && (
                                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full font-medium flex items-center gap-1">
                                                <span className="text-xs">👤</span>
                                                You
                                            </span>
                                        )}

                                        {participant.isCreator && (
                                            <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium flex items-center gap-1">
                                                <span className="text-xs">👑</span>
                                                Host
                                            </span>
                                        )}
                                    </div>

                                    {/* Enhanced Status Information */}
                                    <div className="text-xs text-gray-600 space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-xs">{participant.isCreator ? '👑 Creator' : '🤝 Participant'}</span>
                                            <span className="text-gray-400 text-xs">•</span>
                                            <span className={`text-xs font-medium ${participant.isConnected ? 'text-green-600' : 'text-yellow-600'}`}>
                                                {participant.isConnected ? '🟢 Connected' : '🟡 Disconnected'}
                                            </span>
                                            {!participant.isConnected && (
                                                <>
                                                    <span className="text-gray-400 text-xs">•</span>
                                                    <span className="text-yellow-600 text-xs">May reconnect</span>
                                                </>
                                            )}
                                        </div>

                                        {participant.joinedAt && (
                                            <div className="text-xs text-gray-500">
                                                🕐 Joined {formatTimeAgo(participant.joinedAt)}
                                            </div>
                                        )}

                                        {/* Enhanced Media Status */}
                                        {participant.mediaStatus && participant.isConnected && (
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                <div className="flex items-center gap-0.5">
                                                    <span className={`text-xs ${participant.mediaStatus.hasVideo ? 'text-green-600' : 'text-red-500'}`}>
                                                        {getMediaStatusIcon(participant.mediaStatus, 'video')}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        {participant.mediaStatus.hasVideo ? 'Video' : 'No Video'}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-0.5">
                                                    <span className={`text-xs ${participant.mediaStatus.hasAudio ? 'text-green-600' : 'text-red-500'}`}>
                                                        {getMediaStatusIcon(participant.mediaStatus, 'audio')}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        {participant.mediaStatus.hasAudio ? 'Audio' : 'Muted'}
                                                    </span>
                                                </div>

                                                {participant.mediaStatus.isScreenSharing && (
                                                    <div className="flex items-center gap-0.5">
                                                        <span className="text-xs text-blue-600">
                                                            {getMediaStatusIcon(participant.mediaStatus, 'screen')}
                                                        </span>
                                                        <span className="text-xs text-blue-600 font-medium">
                                                            Screen
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Connection Quality Indicator */}
                            <div className="flex flex-col items-center">
                                <div className={`w-2.5 h-2.5 rounded-full ${
                                    participant.isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
                                }`}></div>
                                <span className="text-xs text-gray-500 mt-0.5">
                                    {participant.isConnected ? 'Online' : 'Offline'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Enhanced Leave Room Confirmation Dialog */}
            {showLeaveDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                                <span className="text-red-600 text-xl">⚠️</span>
                            </div>
                            <h3 className="text-lg font-semibold text-gray-800">
                                Leave Room
                            </h3>
                        </div>

                        <div className="mb-6">
                            <p className="text-gray-600 mb-3">
                                Are you sure you want to leave this room?
                            </p>

                            {roomStore.isRoomCreator && (
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <span className="text-yellow-600 text-lg mt-0.5">ℹ️</span>
                                        <div>
                                            <p className="text-sm font-medium text-yellow-800 mb-1">
                                                Host Leaving
                                            </p>
                                            <p className="text-sm text-yellow-700">
                                                As the room creator, leaving will end the room for all participants.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={cancelLeaveRoom}
                                disabled={isLeavingRoom}
                                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmLeaveRoom}
                                disabled={isLeavingRoom}
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[120px] justify-center"
                            >
                                {isLeavingRoom ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Leaving...
                                    </>
                                ) : (
                                    <>
                                        <span>🚪</span>
                                        Leave Room
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default RoomInfo;