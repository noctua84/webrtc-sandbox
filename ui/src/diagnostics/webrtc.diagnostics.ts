// ui/src/utils/webrtc-diagnostics.ts

import {
    detectNetworkEnvironment,
    getNetworkSpecificRecommendations,
    NetworkEnvironment
} from "@/diagnostics/network.diagnostics.ts";

export interface ConnectivityTestResult {
    mediaAccess: boolean;
    stunConnectivity: boolean;
    candidateGeneration: boolean;
    peerConnectionCreation: boolean;
    localOfferGeneration: boolean;
    iceGathering: boolean;
    issueCount: number;
    issues: string[];
    recommendations: string[];
    networkEnvironment?: NetworkEnvironment | undefined; // Added network detection
    details: {
        mediaDetails?: { videoTracks: number; audioTracks: number };
        stunDetails?: { server: string; candidateType: string; address: string };
        rtcDetails?: { candidateCount: number; gatheringTime: number; candidateTypes?: Record<string, number> };
        networkDetails?: { // Added network analysis
            natType: string;
            firewallLevel: string;
            protocolSupport: { udp: boolean; tcp: boolean };
        };
        errors?: string[];
    };
}

type TestStepName = 'mediaAccess' | 'stunConnectivity' | 'candidateGeneration' |
    'peerConnectionCreation' | 'localOfferGeneration' | 'iceGathering';

interface DiagnosticStep {
    name: TestStepName;
    description: string;
    test: () => Promise<boolean>;
}

export class WebRTCConnectivityDiagnostics {
    private logger: (level: string, message: string, data?: any) => void;
    private testResults: Partial<ConnectivityTestResult> = {};
    private issues: string[] = [];
    private recommendations: string[] = [];
    private networkEnv: NetworkEnvironment | null = null;

    constructor(logger?: (level: string, message: string, data?: any) => void) {
        this.logger = logger || ((level, msg, data) => console.log(`[${level}] ${msg}`, data || ''));
    }

    async runComprehensiveTest(): Promise<ConnectivityTestResult> {
        this.logger('info', '🧪 Starting comprehensive WebRTC connectivity test');

        this.testResults = {};
        this.issues = [];
        this.recommendations = [];

        // Phase 1: Network Environment Detection
        this.logger('info', '🌐 Phase 1: Detecting network environment...');
        try {
            this.networkEnv = await detectNetworkEnvironment();
            this.logger('success', '✅ Network environment detected', {
                type: this.networkEnv.type,
                natType: this.networkEnv.natType,
                firewallLevel: this.networkEnv.firewallLevel
            });

            // Add network-specific details
            this.testResults.details!.networkDetails = {
                natType: this.networkEnv.natType,
                firewallLevel: this.networkEnv.firewallLevel,
                protocolSupport: { udp: true, tcp: true } // Will be updated by protocol tests
            };

            // Add network-specific recommendations early
            this.recommendations.push(...getNetworkSpecificRecommendations(this.networkEnv));

        } catch (error) {
            this.logger('warning', '⚠️ Network environment detection failed', {
                error: (error as Error).message
            });
            // Continue with basic tests even if network detection fails
        }

        // Phase 2: Basic WebRTC Tests
        this.logger('info', '🔧 Phase 2: Running WebRTC component tests...');
        const basicTests: DiagnosticStep[] = [
            {
                name: 'mediaAccess',
                description: 'Testing media device access...',
                test: () => this.testMediaAccess()
            },
            {
                name: 'peerConnectionCreation',
                description: 'Testing peer connection creation...',
                test: () => this.testPeerConnectionCreation()
            },
            {
                name: 'localOfferGeneration',
                description: 'Testing local offer generation...',
                test: () => this.testLocalOfferGeneration()
            }
        ];

        // Run each basic test step
        for (const step of basicTests) {
            try {
                this.logger('info', `🎥 ${step.description}`);
                const result = await step.test();

                this.testResults[step.name] = result;

                if (result) {
                    this.logger('success', `✅ ${step.name} successful`);
                } else {
                    this.logger('error', `❌ ${step.name} failed`);
                    this.issues.push(`${step.name} test failed`);
                }
            } catch (error) {
                this.logger('error', `❌ ${step.name} failed with error`, { error: (error as Error).message });
                this.testResults[step.name] = false;
                this.issues.push(`${step.name} failed: ${(error as Error).message}`);
            }
        }

        // Phase 3: Network-Aware ICE Tests
        this.logger('info', '🌐 Phase 3: Running network-aware ICE tests...');

        // Adjust ICE tests based on detected network environment
        const iceTests = this.getNetworkAwareIceTests();

        for (const test of iceTests) {
            try {
                this.logger('info', `🔗 ${test.description}`);
                const result = await test.test();
                this.testResults[test.name] = result;

                if (result) {
                    this.logger('success', `✅ ${test.name} successful`);
                } else {
                    this.logger('error', `❌ ${test.name} failed`);
                    this.issues.push(`${test.name} test failed`);
                }
            } catch (error) {
                this.logger('error', `❌ ${test.name} failed with error`, {
                    error: (error as Error).message
                });
                this.testResults[test.name] = false;
                this.issues.push(`${test.name} failed: ${(error as Error).message}`);
            }
        }
        // Generate recommendations based on failures
        this.generateSmartRecommendations();

        const finalResult: ConnectivityTestResult = {
            mediaAccess: this.testResults.mediaAccess || false,
            stunConnectivity: this.testResults.stunConnectivity || false,
            candidateGeneration: this.testResults.candidateGeneration || false,
            peerConnectionCreation: this.testResults.peerConnectionCreation || false,
            localOfferGeneration: this.testResults.localOfferGeneration || false,
            iceGathering: this.testResults.iceGathering || false,
            issueCount: this.issues.length,
            issues: this.issues,
            recommendations: this.recommendations,
            networkEnvironment: this.networkEnv || undefined,
            details: this.testResults.details || {}
        };

        this.logger('info', '📊 WebRTC connectivity test completed', {
            issueCount: finalResult.issueCount,
            networkType: this.networkEnv?.type || 'unknown',
            overallStatus: finalResult.issueCount === 0 ? 'healthy' : 'issues'
        });

        return finalResult;
    }

    private getNetworkAwareIceTests(): DiagnosticStep[] {
        const tests: DiagnosticStep[] = [];

        // Always test basic STUN connectivity
        tests.push({
            name: 'stunConnectivity',
            description: 'Testing STUN server connectivity...',
            test: () => this.testStunConnectivity()
        });

        // Adjust candidate generation test based on network environment
        if (this.networkEnv?.natType === 'symmetric' || this.networkEnv?.firewallLevel === 'strict') {
            tests.push({
                name: 'candidateGeneration',
                description: 'Testing TURN relay candidate generation (restrictive network detected)...',
                test: () => this.testTurnCandidateGeneration()
            });
        } else {
            tests.push({
                name: 'candidateGeneration',
                description: 'Testing ICE candidate generation...',
                test: () => this.testCandidateGeneration()
            });
        }

        // Always test ICE gathering completion
        tests.push({
            name: 'iceGathering',
            description: 'Testing ICE gathering completion...',
            test: () => this.testIceGatheringComplete()
        });

        return tests;
    }

    private async testMediaAccess(): Promise<boolean> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            const videoTracks = stream.getVideoTracks().length;
            const audioTracks = stream.getAudioTracks().length;

            this.testResults.details = {
                ...this.testResults.details,
                mediaDetails: { videoTracks, audioTracks }
            };

            this.logger('success', '✅ Media access successful', { videoTracks, audioTracks });

            // Clean up stream
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            this.logger('error', '❌ Media access failed', { error: (error as Error).message });
            return false;
        }
    }

    private async testStunConnectivity(): Promise<boolean> {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.logger('error', '❌ STUN connectivity test timed out');
                resolve(false);
            }, 5000);

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    const parts = event.candidate.candidate.split(' ');
                    const candidateType = parts[7] || 'unknown';
                    const address = parts[4] || 'unknown';

                    this.testResults.details = {
                        ...this.testResults.details,
                        stunDetails: {
                            server: 'stun:stun.l.google.com:19302',
                            candidateType,
                            address
                        }
                    };

                    this.logger('success', '✅ STUN server connectivity confirmed', {
                        server: 'stun:stun.l.google.com:19302',
                        candidateType,
                        address
                    });

                    clearTimeout(timeout);
                    pc.close();
                    resolve(true);
                }
            };

            pc.onicegatheringstatechange = () => {
                if (pc.iceGatheringState === 'complete') {
                    clearTimeout(timeout);
                    pc.close();
                    resolve(false); // No candidates found
                }
            };

            // Create a dummy data channel to trigger ICE gathering
            pc.createDataChannel('test');
            pc.createOffer().then(offer => pc.setLocalDescription(offer));
        });
    }

    private async testCandidateGeneration(): Promise<boolean> {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.logger('error', '❌ Candidate generation test timed out');
                resolve(false);
            }, 8000);

            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            let candidateCount = 0;
            const startTime = Date.now();

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    candidateCount++;
                    this.logger('info', `ICE candidate generated (${candidateCount})`, {
                        type: event.candidate.type,
                        protocol: event.candidate.protocol
                    });
                }
            };

            pc.onicegatheringstatechange = () => {
                if (pc.iceGatheringState === 'complete') {
                    const gatheringTime = Date.now() - startTime;

                    this.testResults.details = {
                        ...this.testResults.details,
                        rtcDetails: { candidateCount, gatheringTime }
                    };

                    clearTimeout(timeout);
                    pc.close();

                    if (candidateCount > 0) {
                        this.logger('success', '✅ ICE candidate generation successful', {
                            candidateCount,
                            gatheringTime: `${gatheringTime}ms`
                        });
                        resolve(true);
                    } else {
                        this.logger('error', '❌ No ICE candidates generated');
                        resolve(false);
                    }
                }
            };

            // Create data channel and offer to start ICE gathering
            pc.createDataChannel('test');
            pc.createOffer().then(offer => pc.setLocalDescription(offer));
        });
    }

    private async testPeerConnectionCreation(): Promise<boolean> {
        try {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            // Test basic peer connection functionality
            const channel = pc.createDataChannel('test', { ordered: true });

            if (pc.connectionState !== undefined && channel.readyState !== undefined) {
                this.logger('success', '✅ Peer connection created successfully', {
                    connectionState: pc.connectionState,
                    channelState: channel.readyState
                });
                pc.close();
                return true;
            } else {
                this.logger('error', '❌ Peer connection creation failed - missing properties');
                pc.close();
                return false;
            }
        } catch (error) {
            this.logger('error', '❌ Peer connection creation failed', {
                error: (error as Error).message
            });
            return false;
        }
    }

    private async testLocalOfferGeneration(): Promise<boolean> {
        try {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            pc.createDataChannel('test');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            if (offer.sdp && offer.type === 'offer') {
                this.logger('success', '✅ Local offer generation successful', {
                    type: offer.type,
                    sdpLength: offer.sdp.length
                });
                pc.close();
                return true;
            } else {
                this.logger('error', '❌ Invalid offer generated');
                pc.close();
                return false;
            }
        } catch (error) {
            this.logger('error', '❌ Local offer generation failed', {
                error: (error as Error).message
            });
            return false;
        }
    }

    private async testIceGatheringComplete(): Promise<boolean> {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.logger('error', '❌ ICE gathering completion test timed out');
                pc.close();
                resolve(false);
            }, 10000);

            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            pc.onicegatheringstatechange = () => {
                this.logger('info', `ICE gathering state changed: ${pc.iceGatheringState}`);

                if (pc.iceGatheringState === 'complete') {
                    this.logger('success', '✅ ICE gathering completed successfully');
                    clearTimeout(timeout);
                    pc.close();
                    resolve(true);
                }
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.logger('info', 'ICE candidate received during gathering test');
                } else {
                    // null candidate indicates gathering is complete
                    this.logger('info', 'ICE gathering finished (null candidate received)');
                }
            };

            // Start the process
            pc.createDataChannel('test');
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .catch(error => {
                    this.logger('error', 'Failed to create offer for ICE gathering test', {
                        error: error.message
                    });
                    clearTimeout(timeout);
                    pc.close();
                    resolve(false);
                });
        });
    }

    private async testTurnCandidateGeneration(): Promise<boolean> {
        this.logger('info', 'Testing TURN relay candidates for restrictive network...');

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.logger('error', '❌ TURN candidate generation timed out');
                resolve(false);
            }, 10000); // Longer timeout for TURN

            const pc = new RTCPeerConnection({
                iceServers: [
                    {
                        urls: [
                            'turn:openrelay.metered.ca:80',
                            'turn:openrelay.metered.ca:443',
                            'turn:openrelay.metered.ca:443?transport=tcp'
                        ],
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    }
                ]
            });

            let candidateCount = 0;
            let relayCount = 0;
            const candidateTypes = new Map<string, number>();
            const startTime = Date.now();

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    candidateCount++;
                    const parts = event.candidate.candidate.split(' ');
                    if (parts.length > 7) {
                        const type = parts[7];

                        if (type) {
                            candidateTypes.set(type, (candidateTypes.get(type) || 0) + 1);
                        } else {
                            this.logger('warning', '⚠️ Candidate type not recognized', {
                                candidate: event.candidate.candidate
                            });
                        }

                        if (type === 'relay') {
                            relayCount++;
                            this.logger('success', `🔄 TURN relay candidate generated`, {
                                protocol: parts[2],
                                relayCount
                            });
                        }
                    }
                }
            };

            pc.onicegatheringstatechange = () => {
                if (pc.iceGatheringState === 'complete') {
                    const gatheringTime = Date.now() - startTime;

                    // Update details with candidate type information
                    this.testResults.details = {
                        ...this.testResults.details,
                        rtcDetails: {
                            candidateCount,
                            gatheringTime,
                            candidateTypes: Object.fromEntries(candidateTypes)
                        }
                    };

                    clearTimeout(timeout);
                    pc.close();

                    const success = relayCount > 0;
                    if (success) {
                        this.logger('success', '✅ TURN relay candidates working', {
                            totalCandidates: candidateCount,
                            relayCandidates: relayCount,
                            gatheringTime: `${gatheringTime}ms`
                        });
                    } else {
                        this.logger('error', '❌ No TURN relay candidates generated', {
                            totalCandidates: candidateCount,
                            candidateTypes: Object.fromEntries(candidateTypes)
                        });
                    }

                    resolve(success);
                }
            };

            // Start the process
            pc.createDataChannel('turn-test');
            pc.createOffer().then(offer => pc.setLocalDescription(offer));
        });
    }

    private generateSmartRecommendations(): void {
        // Clear generic recommendations and build smart ones
        this.recommendations = [];

        // Add network-specific recommendations first
        if (this.networkEnv) {
            this.recommendations.push(...getNetworkSpecificRecommendations(this.networkEnv));
            this.recommendations.push(''); // Separator
        }

        // Add test-specific recommendations
        const results = this.testResults;

        if (!results.mediaAccess) {
            this.recommendations.push(
                '🎥 Media Access Issues:',
                '• Check camera/microphone permissions in browser',
                '• Ensure no other apps are using the devices',
                '• Try refreshing and allowing media access'
            );
        }

        if (!results.stunConnectivity) {
            if (this.networkEnv?.firewallLevel === 'strict') {
                this.recommendations.push(
                    '🔒 Corporate Firewall Blocking STUN:',
                    '• Contact IT to whitelist stun.l.google.com:19302',
                    '• Request WebRTC policy changes',
                    '• Consider internal STUN/TURN servers'
                );
            } else {
                this.recommendations.push(
                    '🌐 STUN Connectivity Issues:',
                    '• Check internet connection',
                    '• Verify DNS resolution',
                    '• Try different STUN servers'
                );
            }
        }

        if (!results.candidateGeneration || !results.iceGathering) {
            if (this.networkEnv?.natType === 'symmetric') {
                this.recommendations.push(
                    '🔄 Symmetric NAT Detected:',
                    '• TURN servers are required (already configured)',
                    '• Direct peer connections will fail',
                    '• Consider relay-only connection mode',
                    '• Upgrade to paid TURN service for production'
                );
            } else if (this.networkEnv?.firewallLevel === 'strict') {
                this.recommendations.push(
                    '🚧 Restrictive Firewall:',
                    '• UDP traffic may be blocked',
                    '• Try TURN with TCP transport',
                    '• Request firewall rule changes',
                    '• Consider VPN bypass for WebRTC'
                );
            } else {
                this.recommendations.push(
                    '❓ ICE Gathering Issues:',
                    '• Network connectivity problems detected',
                    '• Try different network (mobile hotspot)',
                    '• Check router UPnP settings',
                    '• Add more STUN/TURN servers'
                );
            }
        }

        // Success case with network-aware advice
        if (this.issues.length === 0) {
            this.recommendations.push(
                '🎉 All Tests Passed!',
                '• WebRTC should work properly',
                '• Network environment: ' + (this.networkEnv?.type || 'unknown'),
                '• NAT type: ' + (this.networkEnv?.natType || 'unknown')
            );

            if (this.networkEnv?.natType === 'symmetric') {
                this.recommendations.push(
                    '• Note: TURN servers will be used for connections',
                    '• Consider upgrading to paid TURN for production'
                );
            }
        }
    }
}

// Export utility function for easy use
export const runWebRTCDiagnostics = (
    logger?: (level: string, message: string, data?: any) => void
): Promise<ConnectivityTestResult> => {
    const diagnostics = new WebRTCConnectivityDiagnostics(logger);
    return diagnostics.runComprehensiveTest();
};