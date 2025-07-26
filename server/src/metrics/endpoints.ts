// ================================
// Metrics Endpoint Setup
// ================================

import {register} from "prom-client";
import {Container} from "../di";

export function setupMetricsEndpoint(app: any, container: Container): void {
    app.get('/metrics', async (req: any, res: any) => {
        try {
            res.set('Content-Type', register.contentType);
            const metrics = await register.metrics();
            res.end(metrics);
        } catch (error) {
            res.status(500).end('Error generating metrics');
        }
    });
}

// ================================
// Health Check Endpoint (Simple)
// ================================

export function setupHealthEndpoint(app: any, volatileStateManager: any): void {
    app.get('/health', async (req: any, res: any) => {
        try {
            const stats = await volatileStateManager.getHealthStats();

            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: (Date.now() - process.uptime() * 1000),
                rooms: stats.roomStates,
                participants: stats.participantStates,
                memory: process.memoryUsage()
            });
        } catch (error: any) {
            res.status(500).json({
                status: 'unhealthy',
                error: error.message
            });
        }
    });
}