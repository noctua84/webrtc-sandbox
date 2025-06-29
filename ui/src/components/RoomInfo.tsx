import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import roomStore from '../stores/room.store';
import {Participant} from "@/types.ts";

const RoomInfo: React.FC = observer(() => {
    const [showRoomId, setShowRoomId] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);

    if (!roomStore.isInRoom) {
        return null;
    }

    const handleCopyRoomId = async (): Promise<void> => {
        try {
            await navigator.clipboard.writeText(roomStore.currentRoom!.id);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy room ID:', error);
        }
    };

    const handleLeaveRoom = async (): Promise<void> => {
        if (window.confirm('Are you sure you want to leave this room?')) {
            try {
                await roomStore.leaveRoom();
            } catch (error) {
                console.error('Error leaving room:', error);
                // The error is already logged in the store and shown in the UI
            }
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

    // Type guard to ensure currentRoom exists
    if (!roomStore.currentRoom || !roomStore.currentParticipant) {
        return null;
    }

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                    Current Room
                </h2>
                <button
                    onClick={handleLeaveRoom}
                    className="px-3 py-1 text-sm bg-error-500 text-white rounded-lg hover:bg-error-600 transition-colors"
                >
                    Leave Room
                </button>
            </div>

            {/* Room Details */}
            <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                        <label className="text-sm font-medium text-gray-600">Room ID</label>
                        <div className="flex items-center gap-2 mt-1">
                            <code className="text-sm font-mono bg-white px-2 py-1 rounded border">
                                {showRoomId ? roomStore.currentRoom.id : '••••••••'}
                            </code>
                            <button
                                onClick={() => setShowRoomId(!showRoomId)}
                                className="text-xs text-primary-600 hover:text-primary-800 underline"
                            >
                                {showRoomId ? 'Hide' : 'Show'}
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={handleCopyRoomId}
                        className="px-3 py-1 text-sm bg-primary-500 text-white rounded hover:bg-primary-600 transition-colors"
                    >
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 rounded-lg">
                        <label className="text-sm font-medium text-gray-600">Your Role</label>
                        <p className="text-sm mt-1">
                            {roomStore.isRoomCreator ? (
                                <span className="text-primary-600 font-medium">Room Creator</span>
                            ) : (
                                <span className="text-gray-700">Participant</span>
                            )}
                        </p>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-lg">
                        <label className="text-sm font-medium text-gray-600">Participants</label>
                        <p className="text-sm mt-1">
                            <span className="font-medium">{roomStore.participantCount}</span>
                            <span className="text-gray-500"> / {roomStore.currentRoom.maxParticipants}</span>
                        </p>
                    </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                    <label className="text-sm font-medium text-gray-600">Created</label>
                    <p className="text-sm text-gray-700 mt-1">
                        {formatDate(roomStore.currentRoom.createdAt)}
                    </p>
                </div>
            </div>

            {/* Participants List */}
            <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-800 mb-3">
                    Participants ({roomStore.participantCount})
                </h3>
                <div className="space-y-2">
                    {roomStore.participants.map((participant: Participant) => (
                        <div
                            key={participant.socketId}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                                    {participant.userName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-800">
                                        {participant.userName}
                                        {participant.socketId === roomStore.currentParticipant?.socketId && (
                                            <span className="text-xs text-primary-600 ml-2">(You)</span>
                                        )}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {participant.isCreator ? 'Room Creator' : 'Participant'}
                                        {participant.joinedAt && (
                                            <> • Joined {formatDate(participant.joinedAt)}</>
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="status-dot status-connected"></div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Share Room */}
            <div className="mt-6 p-4 bg-primary-50 border border-primary-200 rounded-lg">
                <h4 className="text-sm font-medium text-primary-800 mb-2">
                    Invite Others
                </h4>
                <p className="text-sm text-primary-700 mb-3">
                    Share this room ID with others so they can join:
                </p>
                <div className="flex gap-2">
                    <code className="flex-1 text-sm font-mono bg-white px-3 py-2 rounded border border-primary-300">
                        {roomStore.currentRoom.id}
                    </code>
                    <button
                        onClick={handleCopyRoomId}
                        className="px-4 py-2 bg-primary-500 text-white text-sm rounded hover:bg-primary-600 transition-colors"
                    >
                        {copied ? 'Copied!' : 'Copy ID'}
                    </button>
                </div>
            </div>
        </div>
    );
});

export default RoomInfo;