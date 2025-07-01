import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import roomStore from '@/stores/room.store.ts';
import webrtcStore from '@/stores/webrtc.store.ts';

const MediaControls: React.FC = observer(() => {
    const [isStarting, setIsStarting] = useState(false);

    if (!roomStore.isInRoom) {
        return null;
    }

    const handleStartCamera = async (): Promise<void> => {
        setIsStarting(true);
        try {
            await webrtcStore.startMedia({ video: true, audio: true });
            await webrtcStore.connectToAllParticipants();
        } catch (error) {
            console.error('Failed to start camera:', error);
        } finally {
            setIsStarting(false);
        }
    };

    const handleStartScreenShare = async (): Promise<void> => {
        setIsStarting(true);
        try {
            await webrtcStore.startScreenShare();
            await webrtcStore.connectToAllParticipants();
        } catch (error) {
            console.error('Failed to start screen share:', error);
        } finally {
            setIsStarting(false);
        }
    };

    const handleStopMedia = (): void => {
        webrtcStore.stopMedia();
    };

    const handleToggleVideo = (): void => {
        webrtcStore.toggleVideo();
    };

    const handleToggleAudio = (): void => {
        webrtcStore.toggleAudio();
    };

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Media Controls</h3>

            {/* Media Status */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Status:</span>
                    <span className={`font-medium ${
                        webrtcStore.mediaStatus === 'active' ? 'text-green-600' :
                            webrtcStore.mediaStatus === 'requesting' ? 'text-yellow-600' :
                                webrtcStore.mediaStatus === 'error' ? 'text-red-600' :
                                    'text-gray-600'
                    }`}>
            {webrtcStore.mediaStatus === 'active' ? 'Active' :
                webrtcStore.mediaStatus === 'requesting' ? 'Starting...' :
                    webrtcStore.mediaStatus === 'error' ? 'Error' :
                        'Inactive'}
          </span>
                </div>

                {webrtcStore.isMediaActive && (
                    <>
                        <div className="flex items-center justify-between text-sm mt-1">
                            <span className="text-gray-600">Video:</span>
                            <span className={webrtcStore.hasVideo ? 'text-green-600' : 'text-red-600'}>
                {webrtcStore.hasVideo ? 'On' : 'Off'}
              </span>
                        </div>
                        <div className="flex items-center justify-between text-sm mt-1">
                            <span className="text-gray-600">Audio:</span>
                            <span className={webrtcStore.hasAudio ? 'text-green-600' : 'text-red-600'}>
                {webrtcStore.hasAudio ? 'On' : 'Off'}
              </span>
                        </div>
                        {webrtcStore.isScreenSharing && (
                            <div className="flex items-center justify-between text-sm mt-1">
                                <span className="text-gray-600">Screen Share:</span>
                                <span className="text-blue-600">Active</span>
                            </div>
                        )}
                    </>
                )}

                {webrtcStore.mediaError && (
                    <div className="mt-2 text-xs text-red-600">
                        Error: {webrtcStore.mediaError}
                    </div>
                )}
            </div>

            {/* Control Buttons */}
            <div className="space-y-3">
                {/* Start/Stop Media */}
                {!webrtcStore.isMediaActive ? (
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={handleStartCamera}
                            disabled={isStarting || webrtcStore.mediaStatus === 'requesting'}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            </svg>
                            {isStarting ? 'Starting...' : 'Start Camera'}
                        </button>

                        <button
                            onClick={handleStartScreenShare}
                            disabled={isStarting || webrtcStore.mediaStatus === 'requesting'}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 3v4h10V7H5zM9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
                            </svg>
                            {isStarting ? 'Starting...' : 'Share Screen'}
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Video/Audio Toggle */}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={handleToggleVideo}
                                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                                    webrtcStore.hasVideo
                                        ? 'bg-green-500 text-white hover:bg-green-600'
                                        : 'bg-red-500 text-white hover:bg-red-600'
                                }`}
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    {webrtcStore.hasVideo ? (
                                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                                    ) : (
                                        <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A2 2 0 0017 14V6a2 2 0 00-2-2H5.414l-1.707-1.707zM5.414 6L15 15.586V14a1 1 0 112 0v4a1 1 0 01-1 1H4a1 1 0 01-1-1V6h2.414z" clipRule="evenodd" />
                                    )}
                                </svg>
                                {webrtcStore.hasVideo ? 'Video On' : 'Video Off'}
                            </button>

                            <button
                                onClick={handleToggleAudio}
                                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                                    webrtcStore.hasAudio
                                        ? 'bg-green-500 text-white hover:bg-green-600'
                                        : 'bg-red-500 text-white hover:bg-red-600'
                                }`}
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    {webrtcStore.hasAudio ? (
                                        <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                    ) : (
                                        <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM15.657 6.343a1 1 0 011.414 0L19 8.272l1.929-1.929a1 1 0 111.414 1.414L20.414 9.686l1.929 1.929a1 1 0 01-1.414 1.414L19 11.1l-1.929 1.929a1 1 0 01-1.414-1.414l1.929-1.929-1.929-1.929a1 1 0 010-1.414z" clipRule="evenodd" />
                                    )}
                                </svg>
                                {webrtcStore.hasAudio ? 'Mic On' : 'Mic Off'}
                            </button>
                        </div>

                        {/* Stop Media */}
                        <button
                            onClick={handleStopMedia}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                            </svg>
                            Stop Media
                        </button>
                    </>
                )}
            </div>

            {/* Connection Status */}
            {webrtcStore.isMediaActive && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Peer Connections:</span>
                        <span className="font-medium text-gray-800">
              {webrtcStore.connectedPeersCount} / {webrtcStore.peerConnections.size}
            </span>
                    </div>

                    {Array.from(webrtcStore.peerConnections.values()).map((peer) => (
                        <div key={peer.participantId} className="flex items-center justify-between text-xs mt-1">
                            <span className="text-gray-600">{peer.userName}:</span>
                            <span className={`${
                                peer.connectionState === 'connected' ? 'text-green-600' :
                                    peer.connectionState === 'connecting' ? 'text-yellow-600' :
                                        'text-red-600'
                            }`}>
                {peer.connectionState}
              </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Help Text */}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700">
                    <strong>Camera:</strong> Share video and audio with participants<br/>
                    <strong>Screen Share:</strong> Share your screen instead of camera<br/>
                    Use toggle buttons to mute/unmute during calls
                </p>
            </div>
        </div>
    );
});

export default MediaControls;