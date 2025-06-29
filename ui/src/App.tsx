import React from 'react';
import { observer } from 'mobx-react-lite';

import StatusIndicator from './components/StatusIndicator.tsx';
import LogViewer from './components/LogViewer.tsx';
import RoomForm from './components/RoomForm.tsx';
import RoomInfo from './components/RoomInfo.tsx';
import socketStore from "@/stores/socket.store.ts";
import roomStore from "@/stores/room.store.ts";

const App: React.FC = observer(() => {
    return (
        <div className="min-h-screen bg-gray-100">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <h1 className="text-2xl font-bold text-gray-900">
                                WebRTC Video Streaming
                            </h1>
                            <div className="hidden sm:block text-sm text-gray-500">
                                Simple P2P Video Chat System
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <StatusIndicator
                                status={socketStore.connectionStatus}
                                label={`Server: ${socketStore.connectionStatus}`}
                            />
                            <StatusIndicator
                                status={roomStore.roomStatus}
                                label={`Room: ${roomStore.roomStatus}`}
                            />
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column - Room Management */}
                    <div className="space-y-6">
                        {/* Room Form or Room Info */}
                        {roomStore.isInRoom ? (
                            <RoomInfo />
                        ) : (
                            <RoomForm />
                        )}

                        {/* Connection Error Display */}
                        {socketStore.connectionError && (
                            <div className="bg-error-50 border border-error-200 rounded-lg p-4">
                                <h3 className="text-sm font-medium text-error-800 mb-2">
                                    Connection Error
                                </h3>
                                <p className="text-sm text-error-700 mb-3">
                                    {socketStore.connectionError}
                                </p>
                                <button
                                    onClick={() => socketStore.connect()}
                                    className="px-3 py-1 text-sm bg-error-500 text-white rounded hover:bg-error-600 transition-colors"
                                >
                                    Retry Connection
                                </button>
                            </div>
                        )}

                        {/* Server Status */}
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <h3 className="text-sm font-medium text-gray-800 mb-3">
                                Connection Details
                            </h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Server URL:</span>
                                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                        http://localhost:3001
                                    </code>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Socket ID:</span>
                                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                        {socketStore.socket?.id || 'Not connected'}
                                    </code>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Transport:</span>
                                    <span className="text-xs">
                    {(socketStore.socket as any)?.io?.engine?.transport?.name || 'N/A'}
                  </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Logs and Debug Info */}
                    <div className="space-y-6">
                        {/* Socket Logs */}
                        <LogViewer
                            logs={socketStore.logs}
                            title="Socket Connection Logs"
                            onClear={() => socketStore.clearLogs()}
                        />

                        {/* Room Logs */}
                        <LogViewer
                            logs={roomStore.logs}
                            title="Room Management Logs"
                            onClear={() => roomStore.clearLogs()}
                        />

                        {/* Debug Information */}
                        <div className="bg-white border border-gray-200 rounded-lg">
                            <div className="p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                                <h3 className="text-sm font-semibold text-gray-700">
                                    Debug Information
                                </h3>
                            </div>
                            <div className="p-4 space-y-3">
                                <div>
                                    <h4 className="text-xs font-medium text-gray-600 mb-2">Socket Store State</h4>
                                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                    {JSON.stringify({
                        isConnected: socketStore.isConnected,
                        isConnecting: socketStore.isConnecting,
                        connectionError: socketStore.connectionError,
                        socketId: socketStore.socket?.id,
                        logCount: socketStore.logs.length
                    }, null, 2)}
                  </pre>
                                </div>

                                <div>
                                    <h4 className="text-xs font-medium text-gray-600 mb-2">Room Store State</h4>
                                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                    {JSON.stringify({
                        isInRoom: roomStore.isInRoom,
                        isRoomCreator: roomStore.isRoomCreator,
                        participantCount: roomStore.participantCount,
                        roomStatus: roomStore.roomStatus,
                        currentRoomId: roomStore.currentRoom?.id,
                        currentParticipantId: roomStore.currentParticipant?.socketId,
                        roomError: roomStore.roomError,
                        logCount: roomStore.logs.length
                    }, null, 2)}
                  </pre>
                                </div>

                                {roomStore.isInRoom && (
                                    <div>
                                        <h4 className="text-xs font-medium text-gray-600 mb-2">Current Room Details</h4>
                                        <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify({
                          room: roomStore.currentRoom,
                          participant: roomStore.currentParticipant,
                          participants: roomStore.participants.map(p => ({
                              socketId: p.socketId,
                              userName: p.userName,
                              isCreator: p.isCreator,
                              joinedAt: p.joinedAt
                          }))
                      }, null, 2)}
                    </pre>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-200 mt-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between text-sm text-gray-500">
                        <div>
                            WebRTC Video Streaming Demo - Built with React, Vite, Tailwind, MobX, and TypeScript
                        </div>
                        <div className="flex gap-4">
                            <span>Socket.IO v4.7.5</span>
                            <span>React v18.2.0</span>
                            <span>MobX v6.12.0</span>
                            <span>TypeScript v5.3.3</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
});

export default App