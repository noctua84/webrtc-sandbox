// ui/src/components/WebRTCConnectivityDiagnostics.tsx

import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import webrtcStore from '@/stores/webrtc.store';

interface TestResultItemProps {
    name: string;
    passed: boolean;
    details?: any;
}

const TestResultItem: React.FC<TestResultItemProps> = ({ name, passed, details }) => (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                passed ? 'bg-green-500' : 'bg-red-500'
            }`}>
                {passed ? (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                ) : (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                )}
            </div>
            <span className="font-medium text-gray-900">{name}</span>
            <span className={`px-2 py-1 text-xs rounded-full ${
                passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
        {passed ? 'PASS' : 'FAIL'}
      </span>
        </div>

        {details && (
            <div className="text-sm text-gray-600">
                {typeof details === 'string' ? details : JSON.stringify(details)}
            </div>
        )}
    </div>
);

interface IssueItemProps {
    issue: string;
    recommendations: string[];
}

const IssueItem: React.FC<IssueItemProps> = ({ issue, recommendations }) => (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start gap-3">
            <div className="w-5 h-5 text-red-500 mt-0.5">
                <svg fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
            </div>
            <div className="flex-1">
                <h4 className="font-medium text-red-900 mb-2">🚨 {issue}</h4>
                {recommendations.length > 0 && (
                    <ul className="space-y-1 text-sm text-red-700">
                        {recommendations.map((rec, index) => (
                            <li key={index} className="flex items-start gap-2">
                                <span className="text-red-400 mt-1">•</span>
                                <span>{rec}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    </div>
);

const WebRTCConnectivityDiagnostics: React.FC = observer(() => {
    const [showDetails, setShowDetails] = useState(false);
    const [showRecommendations, setShowRecommendations] = useState(false);

    const runTest = async () => {
        try {
            await webrtcStore.runConnectivityTest();
        } catch (error) {
            console.error('Failed to run connectivity test:', error);
        }
    };

    const result = webrtcStore.connectivityTestResult;
    const summary = webrtcStore.connectivitySummary;
    const isRunning = webrtcStore.isRunningConnectivityTest;

    return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            WebRTC Connectivity Diagnostic
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                            Run this test to diagnose WebRTC connection issues and get specific recommendations.
                        </p>
                    </div>

                    <button
                        onClick={runTest}
                        disabled={isRunning || !webrtcStore.canRunConnectivityTest}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            isRunning
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                    >
                        {isRunning ? (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                Running Test...
                            </div>
                        ) : (
                            'Run Connectivity Test'
                        )}
                    </button>
                </div>
            </div>

            {/* Test Status */}
            {isRunning && (
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-gray-700">Running comprehensive connectivity tests...</span>
                    </div>
                </div>
            )}

            {/* Results Summary */}
            {result && summary && (
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            summary.overallStatus === 'healthy' ? 'bg-green-100' : 'bg-yellow-100'
                        }`}>
                            {summary.overallStatus === 'healthy' ? (
                                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            )}
                        </div>
                        <div>
                            <h4 className="text-lg font-semibold text-gray-900">
                                Test Results:
                            </h4>
                            <p className="text-sm text-gray-600">
                                {summary.overallStatus === 'healthy'
                                    ? 'All connectivity tests passed!'
                                    : `${result.issueCount} issue(s) detected`
                                }
                            </p>
                        </div>
                    </div>

                    {/* Test Results Grid */}
                    <div className="space-y-3 mb-6">
                        <TestResultItem
                            name="Media Access"
                            passed={result.mediaAccess}
                            details={result.details.mediaDetails}
                        />
                        <TestResultItem
                            name="STUN Connectivity"
                            passed={result.stunConnectivity}
                            details={result.details.stunDetails}
                        />
                        <TestResultItem
                            name="ICE Candidates"
                            passed={result.candidateGeneration}
                            details={result.details.rtcDetails}
                        />
                        <TestResultItem
                            name="Peer Connection Creation"
                            passed={result.peerConnectionCreation}
                        />
                        <TestResultItem
                            name="Local Offer Generation"
                            passed={result.localOfferGeneration}
                        />
                        <TestResultItem
                            name="ICE Gathering"
                            passed={result.iceGathering}
                        />
                    </div>

                    {/* Issues Section */}
                    {result.issues.length > 0 && (
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-gray-900">🚨 Issues Detected:</h4>
                            </div>
                            <div className="space-y-3">
                                {result.issues.map((issue, index) => (
                                    <IssueItem
                                        key={index}
                                        issue={issue}
                                        recommendations={result.recommendations}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recommendations */}
                    {result.recommendations.length > 0 && (
                        <div className="mb-6">
                            <button
                                onClick={() => setShowRecommendations(!showRecommendations)}
                                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-3"
                            >
                                <span>💡 Recommendations</span>
                                <svg
                                    className={`w-4 h-4 transition-transform ${showRecommendations ? 'rotate-180' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {showRecommendations && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <ul className="space-y-2">
                                        {result.recommendations.map((recommendation, index) => (
                                            <li key={index} className="flex items-start gap-2 text-blue-900">
                                                <span className="text-blue-400 mt-1">•</span>
                                                <span className="text-sm">{recommendation}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Technical Details */}
                    <div>
                        <button
                            onClick={() => setShowDetails(!showDetails)}
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-700 font-medium mb-3"
                        >
                            <span>🔧 Technical Details</span>
                            <svg
                                className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {showDetails && (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-x-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
                            </div>
                        )}
                    </div>

                    {/* Success Message */}
                    {summary.overallStatus === 'healthy' && (
                        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 text-green-600">
                                    <svg fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-medium text-green-900">
                                        All connectivity tests passed!
                                    </p>
                                    <p className="text-sm text-green-700">
                                        WebRTC should work properly. If you're still having connection issues, check the detailed logs.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* No Results Yet */}
            {!result && !isRunning && (
                <div className="p-6 text-center text-gray-500">
                    <div className="w-12 h-12 mx-auto mb-4 text-gray-400">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p>Click "Run Connectivity Test" to diagnose your WebRTC connection.</p>
                </div>
            )}
        </div>
    );
});

export default WebRTCConnectivityDiagnostics;