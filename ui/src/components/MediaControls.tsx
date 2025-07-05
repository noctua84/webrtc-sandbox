import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import webrtcStore from "@/stores/webrtc.store";
import roomStore from "@/stores/room.store";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getConnectionStatusColor = (connectionState: RTCPeerConnectionState): string => {
    switch (connectionState) {
        case 'connected': return 'bg-green-500';
        case 'connecting': return 'bg-yellow-500';
        case 'new': return 'bg-blue-500';
        case 'disconnected':
        case 'failed': return 'bg-red-500';
        default: return 'bg-gray-500';
    }
};

const getConnectionStatusText = (connectionState: RTCPeerConnectionState): string => {
    switch (connectionState) {
        case 'connected': return 'Connected';
        case 'connecting': return 'Connecting...';
        case 'new': return 'Establishing...';
        case 'disconnected': return 'Disconnected';
        case 'failed': return 'Failed';
        default: return 'Unknown';
    }
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const MediaControls: React.FC = observer(() => {
    const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
    const [diagnosticResults, setDiagnosticResults] = useState<any>(null);

    const handleStartMedia = async () => {
        try {
            await webrtcStore.startMedia({video: true, audio: true});

            // Auto-connect to all existing participants
            if (roomStore.otherParticipants.length > 0) {
                await webrtcStore.connectToAllParticipants();
            }
        } catch (error) {
            console.error('Failed to start media:', error);
        }
    };

    const handleStartScreenShare = async () => {
        try {
            await webrtcStore.startScreenShare();
        } catch (error) {
            console.error('Failed to start screen share:', error);
        }
    };

    const handleStopMedia = () => {
        webrtcStore.stopMedia();
    };

    const handleToggleVideo = () => {
        webrtcStore.toggleVideo();
    };

    const handleToggleAudio = () => {
        webrtcStore.toggleAudio();
    };

    const handleRunDiagnostic = async () => {
        setIsRunningDiagnostic(true);
        setDiagnosticResults(null);

        try {
            // Note: This assumes the diagnostic methods are added to the WebRTC store
            const results = await (webrtcStore as any).testWebRTCConnectivity();
            setDiagnosticResults(results);
        } catch (error) {
            console.error('Diagnostic test failed:', error);
            setDiagnosticResults({
                error: 'Diagnostic test failed to run',
                details: (error as Error).message
            });
        } finally {
            setIsRunningDiagnostic(false);
        }
    };

    const totalOtherParticipants = roomStore.otherParticipants.length;
    const connectedPeers = webrtcStore.connectedPeersCount;
    const totalConnections = webrtcStore.peerConnections.size;
    const isConnecting = webrtcStore.isConnecting;
    const hasFailedConnections = webrtcStore.hasFailedConnections;

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Media Controls</h3>

            {/* Media Control Buttons */}
            <div className="space-y-3">
                {!webrtcStore.isMediaActive && (
                    <>
                        {/* Start Camera */}
                        <button
                            onClick={handleStartMedia}
                            disabled={!webrtcStore.canStartMedia}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            </svg>
                            Start Camera
                        </button>

                        {/* Start Screen Share */}
                        <button
                            onClick={handleStartScreenShare}
                            disabled={!webrtcStore.canStartMedia}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v6h10V5H5z" clipRule="evenodd" />
                                <path d="M8 15v1h4v-1H8z" />
                                <path d="M6 16h8v1H6v-1z" />
                            </svg>
                            Start Screen Share
                        </button>
                    </>
                )}
                {webrtcStore.isMediaActive && (
                    <>
                        {/* Media Toggle Controls */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* Toggle Video */}
                            <button
                                onClick={handleToggleVideo}
                                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                                    webrtcStore.hasVideo
                                        ? 'bg-gray-500 text-white hover:bg-gray-600'
                                        : 'bg-red-500 text-white hover:bg-red-600'
                                }`}
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    {webrtcStore.hasVideo ? (
                                        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                                    ) : (
                                        <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A2 2 0 0017 14V6a2 2 0 00-2-2H5.414l-1.707-1.707zM5.414 6L15 15.586V14a1 1 0 112 0v4a1 1 0 01-1 1H4a1 1 0 01-1-1V6h2.414z" clipRule="evenodd" />
                                    )}
                                </svg>
                                {webrtcStore.hasVideo ? 'Camera On' : 'Camera Off'}
                            </button>

                            {/* Toggle Audio */}
                            <button
                                onClick={handleToggleAudio}
                                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                                    webrtcStore.hasAudio
                                        ? 'bg-gray-500 text-white hover:bg-gray-600'
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

                        {/* Switch Media Source */}
                        <div className="grid grid-cols-2 gap-3">
                            {!webrtcStore.isScreenSharing && (
                                <button
                                    onClick={handleStartScreenShare}
                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v6h10V5H5z" clipRule="evenodd" />
                                    </svg>
                                    Share Screen
                                </button>
                            )}

                            {/* Stop Media */}
                            <button
                                onClick={handleStopMedia}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                                </svg>
                                Stop Media
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* WebRTC Connectivity Diagnostic Section */}
            <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <h4 className="text-sm font-medium text-purple-800 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    WebRTC Connectivity Diagnostic
                </h4>

                <p className="text-xs text-purple-700 mb-3">
                    Run this test to diagnose WebRTC connection issues and get specific recommendations.
                </p>

                <button
                    onClick={handleRunDiagnostic}
                    disabled={isRunningDiagnostic}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed transition-colors"
                >
                    {isRunningDiagnostic ? (
                        <>
                            <svg className="w-4 h-4 animate-spin" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H8a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H12a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                            </svg>
                            Running Diagnostic...
                        </>
                    ) : (
                        <>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Run Connectivity Test
                        </>
                    )}
                </button>

                {/* Diagnostic Results Display */}
                {diagnosticResults && (
                    <div className="mt-4 space-y-3">
                        {diagnosticResults.error ? (
                            <div className="p-3 bg-red-50 border border-red-200 rounded">
                                <div className="text-sm text-red-800">
                                    <strong>Test Error:</strong> {diagnosticResults.error}
                                </div>
                                {diagnosticResults.details && (
                                    <div className="text-xs text-red-600 mt-1">
                                        {diagnosticResults.details}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* Test Results Summary */}
                                <div className="p-3 bg-white border border-purple-200 rounded">
                                    <h5 className="text-xs font-medium text-purple-800 mb-2">Test Results:</h5>
                                    <div className="space-y-1 text-xs">
                                        <div className="flex justify-between">
                                            <span>Media Access:</span>
                                            <span className={diagnosticResults.mediaAccess ? 'text-green-600' : 'text-red-600'}>
                                                {diagnosticResults.mediaAccess ? '✅ PASS' : '❌ FAIL'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>STUN Connectivity:</span>
                                            <span className={diagnosticResults.stunConnectivity ? 'text-green-600' : 'text-red-600'}>
                                                {diagnosticResults.stunConnectivity ? '✅ PASS' : '❌ FAIL'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>ICE Candidates:</span>
                                            <span className={diagnosticResults.candidateGeneration ? 'text-green-600' : 'text-red-600'}>
                                                {diagnosticResults.candidateGeneration ? '✅ PASS' : '❌ FAIL'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Issues Detected */}
                                {diagnosticResults.detectedIssues && diagnosticResults.detectedIssues.length > 0 && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded">
                                        <h5 className="text-xs font-medium text-red-800 mb-2">🚨 Issues Detected:</h5>
                                        <ul className="text-xs text-red-700 space-y-1">
                                            {diagnosticResults.detectedIssues.map((issue: string, index: number) => (
                                                <li key={index}>• {issue}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Recommendations */}
                                {diagnosticResults.recommendations && diagnosticResults.recommendations.length > 0 && (
                                    <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                                        <h5 className="text-xs font-medium text-blue-800 mb-2">💡 Recommendations:</h5>
                                        <ul className="text-xs text-blue-700 space-y-1">
                                            {diagnosticResults.recommendations.map((rec: string, index: number) => (
                                                <li key={index}>• {rec}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* All Tests Passed */}
                                {diagnosticResults.mediaAccess && diagnosticResults.stunConnectivity && diagnosticResults.candidateGeneration && (
                                    <div className="p-3 bg-green-50 border border-green-200 rounded">
                                        <div className="text-sm text-green-800 flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            <strong>All connectivity tests passed!</strong>
                                        </div>
                                        <p className="text-xs text-green-600 mt-1">
                                            WebRTC should work properly. If you're still having connection issues, check the detailed logs.
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Enhanced Connection Status */}
            {webrtcStore.isMediaActive && totalOtherParticipants > 0 && (
                <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-gray-800">Connection Status</h4>
                        <div className="flex items-center gap-2">
                            {isConnecting && (
                                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                            )}
                            {hasFailedConnections && (
                                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                            )}
                            <span className="text-sm font-medium text-gray-800">
                                {connectedPeers} / {totalOtherParticipants} connected
                            </span>
                        </div>
                    </div>

                    {/* Overall Status Bar */}
                    <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Connection Progress</span>
                            <span>{Math.round((connectedPeers / totalOtherParticipants) * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all duration-300 ${
                                    connectedPeers === totalOtherParticipants ? 'bg-green-500' :
                                        connectedPeers > 0 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${(connectedPeers / totalOtherParticipants) * 100}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Individual Connection Status */}
                    <div className="space-y-2">
                        {Array.from(webrtcStore.peerConnections.values()).map((peer) => {
                            const statusColor = getConnectionStatusColor(peer.connectionState);
                            const statusText = getConnectionStatusText(peer.connectionState);
                            const isConnecting = ['connecting', 'new'].includes(peer.connectionState);

                            return (
                                <div key={peer.participantId} className="flex items-center justify-between text-xs bg-white p-2 rounded">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${statusColor} ${
                                            isConnecting ? 'animate-pulse' : ''
                                        }`}></div>
                                        <span className="text-gray-800 truncate max-w-[120px] font-medium">
                                            {peer.userName}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Connection Quality Indicator */}
                                        {peer.connectionState === 'connected' && (
                                            <div className="flex gap-1">
                                                <div className="w-1 h-3 bg-green-400 rounded-full"></div>
                                                <div className="w-1 h-3 bg-green-400 rounded-full"></div>
                                                <div className="w-1 h-3 bg-green-400 rounded-full"></div>
                                            </div>
                                        )}
                                        <span className={`font-medium ${
                                            peer.connectionState === 'connected' ? 'text-green-600' :
                                                isConnecting ? 'text-yellow-600' :
                                                    'text-red-600'
                                        }`}>
                                            {statusText}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Show participants without connections */}
                        {roomStore.otherParticipants
                            .filter(p => !webrtcStore.peerConnections.has(p.socketId))
                            .map((participant) => (
                                <div key={participant.socketId} className="flex items-center justify-between text-xs bg-white p-2 rounded">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                                        <span className="text-gray-800 truncate max-w-[120px] font-medium">
                                            {participant.userName}
                                        </span>
                                    </div>
                                    <span className="font-medium text-orange-600">
                                        Waiting...
                                    </span>
                                </div>
                            ))
                        }
                    </div>

                    {/* Advanced Status Information */}
                    {totalConnections > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                    <span className="text-gray-600">Total Connections:</span>
                                    <span className="ml-1 font-medium text-gray-800">{totalConnections}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600">Connected:</span>
                                    <span className="ml-1 font-medium text-green-600">{connectedPeers}</span>
                                </div>
                            </div>

                            {/* ICE Candidates Status */}
                            {webrtcStore.pendingCandidatesCount > 0 && (
                                <div className="mt-2 flex items-center gap-1 text-xs text-blue-600">
                                    <svg className="w-3 h-3 animate-spin" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H8a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H12a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                    </svg>
                                    <span>Buffering {webrtcStore.pendingCandidatesCount} ICE candidate(s)</span>
                                </div>
                            )}

                            {/* Retry Status */}
                            {webrtcStore.activeRetryCount > 0 && (
                                <div className="mt-2 flex items-center gap-1 text-xs text-yellow-600">
                                    <svg className="w-3 h-3 animate-spin" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H8a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H12a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                    </svg>
                                    <span>Retrying {webrtcStore.activeRetryCount} connection(s)</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Media Status Information */}
            {webrtcStore.isMediaActive && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-sm font-medium text-blue-800 mb-3">Local Media Status</h4>

                    <div className="space-y-2">
                        {/* Media Type */}
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-blue-700">Source:</span>
                            <div className="flex items-center gap-1">
                                {webrtcStore.isScreenSharing ? (
                                    <>
                                        <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v6h10V5H5z" clipRule="evenodd" />
                                        </svg>
                                        <span className="font-medium text-blue-800">Screen Share</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                                        </svg>
                                        <span className="font-medium text-blue-800">Camera</span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Video Status */}
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-blue-700">Video:</span>
                            <div className="flex items-center gap-1">
                                <div className={`w-2 h-2 rounded-full ${webrtcStore.hasVideo ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <span className={`font-medium ${webrtcStore.hasVideo ? 'text-green-600' : 'text-red-600'}`}>
                                    {webrtcStore.hasVideo ? 'On' : 'Off'}
                                </span>
                            </div>
                        </div>

                        {/* Audio Status */}
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-blue-700">Audio:</span>
                            <div className="flex items-center gap-1">
                                <div className={`w-2 h-2 rounded-full ${webrtcStore.hasAudio ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <span className={`font-medium ${webrtcStore.hasAudio ? 'text-green-600' : 'text-red-600'}`}>
                                    {webrtcStore.hasAudio ? 'On' : 'Off'}
                                </span>
                            </div>
                        </div>

                        {/* Stream Details */}
                        {webrtcStore.localStream && (
                            <div className="pt-2 border-t border-blue-200">
                                <div className="text-xs space-y-1">
                                    <div className="flex justify-between">
                                        <span className="text-blue-600">Video Tracks:</span>
                                        <span className="font-mono text-blue-800">
                                            {webrtcStore.localStream.getVideoTracks().length}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-blue-600">Audio Tracks:</span>
                                        <span className="font-mono text-blue-800">
                                            {webrtcStore.localStream.getAudioTracks().length}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-blue-600">Stream ID:</span>
                                        <span className="font-mono text-blue-800 text-xs truncate max-w-[100px]">
                                            {webrtcStore.localStream.id}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Error Display */}
            {webrtcStore.mediaError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-red-700">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium">Media Error:</span>
                    </div>
                    <p className="text-sm text-red-600 mt-1">{webrtcStore.mediaError}</p>
                </div>
            )}

            {/* Help Information */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <h4 className="text-sm font-medium text-gray-800 mb-2">Controls Guide</h4>
                <div className="text-xs text-gray-600 space-y-1">
                    <div><strong>Camera:</strong> Share video and audio with participants</div>
                    <div><strong>Screen Share:</strong> Share your screen instead of camera</div>
                    <div><strong>Toggles:</strong> Mute/unmute during active calls</div>
                    <div><strong>Diagnostic:</strong> Test WebRTC connectivity and troubleshoot issues</div>
                    {totalOtherParticipants > 0 && (
                        <div className="pt-1 border-t border-gray-300">
                            <strong>Tip:</strong> Connections establish automatically when you start media
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            {webrtcStore.isMediaActive && totalOtherParticipants > 0 && (
                <div className="flex gap-2">
                    <button
                        onClick={() => webrtcStore.connectToAllParticipants()}
                        className="flex-1 text-xs px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    >
                        Reconnect All
                    </button>
                    <button
                        onClick={() => webrtcStore.clearLogs()}
                        className="flex-1 text-xs px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                    >
                        Clear Logs
                    </button>
                </div>
            )}
        </div>
    );
});


export default MediaControls;