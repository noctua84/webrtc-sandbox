import express from "express";
import { createServer } from "http";
import {createAppContainer} from "./di";
import {Server} from "socket.io";
import cors from "cors";
import helmet from "helmet";
import {ClientToServerEvents, ServerToClientEvents} from "./types/socket.event.types";
import {setupMetricsEndpoint} from "./metrics/endpoints";
import {registerChatHandlers} from "./handler/chat.handler";
import {SocketConnectionContext} from "./types/socket.types";
import {registerRoomHandlers} from "./handler/room.handler";
import {handleDisconnect} from "./handler/connection.handler";
import {registerWebRTCHandlers} from "./handler/webrtc.handler";
import {registerMediaHandlers} from "./handler/media.handler";
import {createEventEndpoints} from "./event/endpoints";

let isShuttingDown = false;
let prismaInstance: any;

const container = createAppContainer()

console.log(container)

const cfg = container.get<'config'>('config')
const logger = container.get<'logger'>('logger')
const metrics = container.get<'metrics'>('metrics')

const app = express();
const server = createServer(app)
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
        origin: cfg.server.cors.origin,
        methods: cfg.server.cors.methods,
        credentials: cfg.server.cors.credentials,
    }
})

container.set('io', io);

// Middleware
app.use(cors({
    origin: cfg.server.cors.origin,
    methods: cfg.server.cors.methods,
    credentials: cfg.server.cors.credentials
}));
app.use(helmet());
app.use(express.json());

try {
    // Initialize Prisma client
    prismaInstance = container.get('prisma');
} catch (error) {
    logger.warning('Prisma client not available during startup', { error });
}

// API routes:
setupMetricsEndpoint(app, container);
app.use('/api', createEventEndpoints(container));

// WebSocket connection handling
io.on('connection', socket => {
    logger.info(`New socket connection: ${socket.id}`);

    metrics.recordSocketConnection(true)

    const context: SocketConnectionContext = {
        socket,
        io,
        connectionTime: new Date(),
        connectionId: socket.id,
    }

    // ================================
    // REGISTER ALL HANDLERS
    // ================================

    try {
        // Register chat handlers with full DI support
        const chatHandlers = registerChatHandlers(container, context);
        const roomHandlers = registerRoomHandlers(container, context);
        const webrtcHandlers = registerWebRTCHandlers(container, context);
        const mediaHandlers = registerMediaHandlers(container, context);

        logger.success('All socket handlers registered', {
            socketId: socket.id,
            chatHandlers: Object.keys(chatHandlers),
            roomHandlers: Object.keys(roomHandlers),
            webrtcHandlers: Object.keys(webrtcHandlers),
            mediaHandlers: Object.keys(mediaHandlers)
        });

    } catch (error) {
        const err = error as Error;
        metrics.recordError('socket', 'error', 'Error registering socket handlers');
        logger.error('Error registering socket handlers', {
            socketId: socket.id,
            error: err.message,
            stack: err.stack
        });

        // Disconnect problematic socket
        socket.emit('server-error', {
            message: 'Failed to initialize connection',
            shouldReconnect: true
        });
        socket.disconnect();
        return;
    }

    // ================================
    // CONNECTION EVENT HANDLERS
    // ================================

    socket.on('disconnect', async (reason) => {
        metrics.recordSocketConnection(false);
        logger.info(`Socket disconnected: ${socket.id}, reason: ${reason}`);

        // Handle graceful disconnection
        await handleDisconnect(socket, container, reason);
    })

    socket.on('error', (error) => {
        metrics.recordError('socket', 'error', 'Socket error');
        logger.error('Socket error occurred', {
            socketId: socket.id,
            error: error.message
        });
    });
})

io.on('error', (error) => {
    metrics.recordError('socket', 'critical', 'Socket.IO server error');
    logger.error('Socket.IO server error', {
        error: error.message,
        stack: error.stack
    });
});

// Shutdown handling
async function gracefulShutdown(signal: string) {
    if (isShuttingDown) {
        logger.info(`Received ${signal}, but already shutting down`);
        return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown`);

    try {
        // 1. Stop accepting new connections
        server.close(() => {
            logger.info('HTTP server closed');
        });

        // 2. Close all socket connections
        await io.close(() => {
            logger.info('Socket.io server closed');
        });

        // 3. Disconnect Prisma client
        if (prismaInstance) {
            await prismaInstance.$disconnect();
            logger.info('Prisma client disconnected');
        }

        logger.info('Graceful shutdown completed');
        process.exit(0);
    } catch (error: any) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
}

process.on("SIGTERM", () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', async (error) => {
    logger.error('Uncaught Exception:', error);
    await gracefulShutdown('uncaughtException');
});

// Start the server
const port = cfg.server.port || 3001;
server.listen(port, () => {
    logger.info(`Server is running on http://localhost:${port}`);
})