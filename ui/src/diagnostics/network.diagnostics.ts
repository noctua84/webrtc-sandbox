export interface NetworkEnvironment {
    type: 'corporate' | 'residential' | 'mobile' | 'public' | 'unknown';
    natType: 'none' | 'full-cone' | 'restricted' | 'port-restricted' | 'symmetric' | 'unknown';
    firewallLevel: 'open' | 'moderate' | 'strict' | 'unknown';
    recommendations: string[];
}

export const detectNetworkEnvironment = async (): Promise<NetworkEnvironment> => {
    const results = {
        type: 'unknown' as NetworkEnvironment['type'],
        natType: 'unknown' as NetworkEnvironment['natType'],
        firewallLevel: 'unknown' as NetworkEnvironment['firewallLevel'],
        recommendations: [] as string[]
    };

    try {
        // Test 1: Basic STUN connectivity
        const stunResult = await testStunConnectivity();

        // Test 2: Multiple STUN servers to detect NAT type
        const natResult = await detectNATType();

        // Test 3: TCP vs UDP connectivity
        const protocolResult = await testProtocolSupport();

        // Analyze results
        if (!stunResult.success) {
            results.firewallLevel = 'strict';
            results.recommendations.push(
                'STUN servers are blocked - likely corporate firewall',
                'Contact IT department about WebRTC support',
                'May need to whitelist STUN/TURN server IPs'
            );
        }

        if (natResult.symmetric) {
            results.natType = 'symmetric';
            results.recommendations.push(
                'Symmetric NAT detected - TURN servers required',
                'Direct peer connections may fail',
                'Consider using relay servers'
            );
        }

        if (!protocolResult.udp && protocolResult.tcp) {
            results.recommendations.push(
                'UDP traffic appears blocked',
                'Configure TURN servers with TCP transport',
                'Add ?transport=tcp to TURN URLs'
            );
        }

        // Determine environment type
        if (results.firewallLevel === 'strict') {
            results.type = 'corporate';
        } else if (results.natType === 'symmetric') {
            results.type = 'mobile';
        } else {
            results.type = 'residential';
        }

    } catch (error) {
        results.recommendations.push(
            'Network detection failed',
            'Check browser console for errors',
            'Try different network environment'
        );
    }

    return results;
};

const testStunConnectivity = (): Promise<{ success: boolean; candidates: number }> => {
    return new Promise((resolve) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        let candidateCount = 0;
        const timeout = setTimeout(() => {
            pc.close();
            resolve({ success: candidateCount > 0, candidates: candidateCount });
        }, 5000);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                candidateCount++;
            }
        };

        pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') {
                clearTimeout(timeout);
                pc.close();
                resolve({ success: candidateCount > 0, candidates: candidateCount });
            }
        };

        pc.createDataChannel('test');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
    });
};

const detectNATType = (): Promise<{ symmetric: boolean; restrictive: boolean }> => {
    return new Promise((resolve) => {
        const servers = [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302'
        ];

        const results: any[] = [];
        let completed = 0;

        servers.forEach((server, index) => {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: server }]
            });

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    const candidate = event.candidate.candidate;
                    const parts = candidate.split(' ');
                    if (parts.length > 4) {
                        results[index] = parts[4]; // External IP
                    }
                }
            };

            pc.onicegatheringstatechange = () => {
                if (pc.iceGatheringState === 'complete') {
                    completed++;
                    pc.close();

                    if (completed === servers.length) {
                        // Analyze results
                        const uniqueIPs = new Set(results.filter(Boolean));
                        const symmetric = uniqueIPs.size > 1;
                        const restrictive = results.filter(Boolean).length < servers.length;

                        resolve({ symmetric, restrictive });
                    }
                }
            };

            pc.createDataChannel('test');
            pc.createOffer().then(offer => pc.setLocalDescription(offer));
        });

        // Timeout fallback
        setTimeout(() => {
            if (completed < servers.length) {
                resolve({ symmetric: true, restrictive: true });
            }
        }, 8000);
    });
};

const testProtocolSupport = (): Promise<{ udp: boolean; tcp: boolean }> => {
    return new Promise((resolve) => {
        let udpSuccess = false;
        let tcpSuccess = false;
        let testsCompleted = 0;

        // Test UDP (standard STUN)
        const udpPc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        udpPc.onicecandidate = (event) => {
            if (event.candidate) {
                udpSuccess = true;
            }
        };

        udpPc.onicegatheringstatechange = () => {
            if (udpPc.iceGatheringState === 'complete') {
                udpPc.close();
                testsCompleted++;
                if (testsCompleted === 2) {
                    resolve({ udp: udpSuccess, tcp: tcpSuccess });
                }
            }
        };

        // Test TCP (TURN with TCP)
        const tcpPc = new RTCPeerConnection({
            iceServers: [{
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }]
        });

        tcpPc.onicecandidate = (event) => {
            if (event.candidate && event.candidate.candidate.includes('tcp')) {
                tcpSuccess = true;
            }
        };

        tcpPc.onicegatheringstatechange = () => {
            if (tcpPc.iceGatheringState === 'complete') {
                tcpPc.close();
                testsCompleted++;
                if (testsCompleted === 2) {
                    resolve({ udp: udpSuccess, tcp: tcpSuccess });
                }
            }
        };

        // Start both tests
        udpPc.createDataChannel('test');
        udpPc.createOffer().then(offer => udpPc.setLocalDescription(offer));

        tcpPc.createDataChannel('test');
        tcpPc.createOffer().then(offer => tcpPc.setLocalDescription(offer));

        // Timeout fallback
        setTimeout(() => {
            if (testsCompleted < 2) {
                resolve({ udp: udpSuccess, tcp: tcpSuccess });
            }
        }, 10000);
    });
};

export const getNetworkSpecificRecommendations = (env: NetworkEnvironment): string[] => {
    const recommendations: string[] = [];

    switch (env.type) {
        case 'corporate':
            recommendations.push(
                '🏢 Corporate Network Detected',
                '• Ask IT to whitelist WebRTC traffic on ports 3478-3479',
                '• Request TURN server access or deploy internal TURN servers',
                '• Consider using TCP transport for TURN servers',
                '• May need VPN bypass for WebRTC traffic'
            );
            break;

        case 'mobile':
            recommendations.push(
                '📱 Mobile/Carrier Network Detected',
                '• Symmetric NAT detected - TURN servers required',
                '• Try switching between WiFi and cellular data',
                '• Some carriers block WebRTC - contact provider',
                '• Consider using dedicated TURN infrastructure'
            );
            break;

        case 'residential':
            recommendations.push(
                '🏠 Residential Network',
                '• Standard home router detected',
                '• Check router UPnP settings',
                '• Consider port forwarding for hosting',
                '• STUN servers should be sufficient'
            );
            break;

        default:
            recommendations.push(
                '❓ Unknown Network Environment',
                '• Run network diagnostics for more info',
                '• Try different STUN/TURN server combinations',
                '• Check browser console for specific errors'
            );
    }

    if (env.natType === 'symmetric') {
        recommendations.push(
            '',
            '🔄 Symmetric NAT Solutions:',
            '• Use reliable TURN servers',
            '• Enable TCP fallback transport',
            '• Consider relay-only mode for critical connections'
        );
    }

    return recommendations;
};