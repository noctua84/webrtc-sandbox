import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import roomStore from '../stores/room.store';
import socketStore from '../stores/socket.store';

type FormMode = 'create' | 'join';

const RoomForm: React.FC = observer(() => {
    const [userName, setUserName] = useState<string>('');
    const [roomId, setRoomId] = useState<string>('');
    const [mode, setMode] = useState<FormMode>('create');
    const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

    const handleCreateRoom = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();

        if (!userName.trim()) {
            return;
        }

        try {
            await roomStore.createRoom(userName.trim(), roomId.trim() || undefined);
        } catch (error) {
            console.error('Error creating room:', error);
        }
    };

    const handleJoinRoom = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();

        if (!userName.trim() || !roomId.trim()) {
            return;
        }

        try {
            await roomStore.joinRoom(roomId.trim(), userName.trim());
        } catch (error) {
            console.error('Error joining room:', error);
        }
    };

    const isFormDisabled = !socketStore.isConnected || roomStore.isCreatingRoom || roomStore.isJoiningRoom;

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
                WebRTC Video Room
            </h2>

            {/* Mode Selection */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setMode('create')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        mode === 'create'
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    Create Room
                </button>
                <button
                    onClick={() => setMode('join')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        mode === 'join'
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    Join Room
                </button>
            </div>

            {/* Connection Status Warning */}
            {!socketStore.isConnected && (
                <div className="mb-4 p-3 bg-warning-50 border border-warning-200 rounded-lg">
                    <p className="text-sm text-warning-700">
                        {socketStore.isConnecting
                            ? 'Connecting to server...'
                            : 'Not connected to server. Please wait for connection.'}
                    </p>
                </div>
            )}

            {/* Error Display */}
            {roomStore.roomError && (
                <div className="mb-4 p-3 bg-error-50 border border-error-200 rounded-lg">
                    <p className="text-sm text-error-700">{roomStore.roomError}</p>
                    <button
                        onClick={() => roomStore.clearError()}
                        className="mt-2 text-xs text-error-600 hover:text-error-800 underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Create Room Form */}
            {mode === 'create' && (
                <form onSubmit={handleCreateRoom} className="space-y-4">
                    <div>
                        <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-1">
                            Your Name *
                        </label>
                        <input
                            type="text"
                            id="userName"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            placeholder="Enter your display name"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            disabled={isFormDisabled}
                            required
                        />
                    </div>

                    {/* Advanced Options */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="text-sm text-primary-600 hover:text-primary-800 underline"
                        >
                            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
                        </button>
                    </div>

                    {showAdvanced && (
                        <div className="animate-fadeIn">
                            <label htmlFor="customRoomId" className="block text-sm font-medium text-gray-700 mb-1">
                                Custom Room ID (optional)
                            </label>
                            <input
                                type="text"
                                id="customRoomId"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                placeholder="Leave empty for auto-generated ID"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                disabled={isFormDisabled}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                If left empty, a unique room ID will be generated automatically.
                            </p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isFormDisabled || !userName.trim()}
                        className="w-full py-2 px-4 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                        {roomStore.isCreatingRoom ? 'Creating Room...' : 'Create Room'}
                    </button>
                </form>
            )}

            {/* Join Room Form */}
            {mode === 'join' && (
                <form onSubmit={handleJoinRoom} className="space-y-4">
                    <div>
                        <label htmlFor="joinUserName" className="block text-sm font-medium text-gray-700 mb-1">
                            Your Name *
                        </label>
                        <input
                            type="text"
                            id="joinUserName"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            placeholder="Enter your display name"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            disabled={isFormDisabled}
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="joinRoomId" className="block text-sm font-medium text-gray-700 mb-1">
                            Room ID *
                        </label>
                        <input
                            type="text"
                            id="joinRoomId"
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value)}
                            placeholder="Enter the room ID to join"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            disabled={isFormDisabled}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isFormDisabled || !userName.trim() || !roomId.trim()}
                        className="w-full py-2 px-4 bg-success-500 text-white rounded-lg hover:bg-success-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                        {roomStore.isJoiningRoom ? 'Joining Room...' : 'Join Room'}
                    </button>
                </form>
            )}

            {/* Helper Text */}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600">
                    {mode === 'create'
                        ? 'Create a new video room and share the room ID with others to let them join.'
                        : 'Enter a room ID that someone shared with you to join their video room.'
                    }
                </p>
            </div>
        </div>
    );
});

export default RoomForm;