import express from "express";
import { createServer } from "http";
import {createAppContainer} from "./di";
import {Server} from "socket.io";
import cors from "cors";
import helmet from "helmet";
import {ClientToServerEvents, ServerToClientEvents} from "./types/event.types";
import {setupMetricsEndpoint} from "./metrics/endpoints";
import {registerChatHandlers} from "./handler/chat.handler";
import {SocketConnectionContext} from "./types/socket.types";

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

        // TODO: Register other handlers when ready
        // const roomHandlers = registerRoomHandlers(socketContainer, socket);
        // const webrtcHandlers = registerWebRTCHandlers(socketContainer, socket);

        logger.success('All socket handlers registered', {
            socketId: socket.id,
            chatHandlers: Object.keys(chatHandlers),
            // roomHandlers: Object.keys(roomHandlers),
            // webrtcHandlers: Object.keys(webrtcHandlers)
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

    socket.on('disconnect', (reason) => {
        const sessionDuration = Date.now() - context.connectionTime.getTime();

        logger.info('Socket disconnecting', {
            socketId: socket.id,
            reason,
            sessionDuration
        });

        // Record disconnection metrics
        metrics.recordSocketConnection(false);

        // Clean up room membership if needed
        try {
            const roomManager = container.get<'roomManager'>('roomManager');
            const roomId = roomManager.getRoomBySocketId(socket.id);

            if (roomId) {
                const result = roomManager.removeParticipantFromRoom(socket.id, false);

                if (result?.room) {
                    // Record participant leave
                    metrics.recordParticipantLeave('disconnect', sessionDuration);

                    // Broadcast room update
                    io.to(roomId).emit('room-updated', {
                        roomId,
                        participants: result.room.participants,
                        event: 'participant-disconnected',
                        leftParticipantId: socket.id
                    });

                    // Clean up chat history if room is empty
                    if (result.room.participants.length === 0) {
                        const messageRepository = container.get<'messageRepository'>('messageRepository');
                        messageRepository.clearRoomMessages(roomId);

                        logger.info('Cleaned up empty room chat history', {
                            roomId,
                            lastParticipant: socket.id
                        });
                    }

                    logger.info('Participant removed from room', {
                        socketId: socket.id,
                        roomId,
                        remainingParticipants: result.room.participants.length
                    });
                }
            }
        } catch (error) {
            const err = error as Error;
            metrics.recordError('room', 'error', 'Error during disconnect cleanup');
            logger.error('Error during disconnect cleanup', {
                error: err.message,
                socketId: socket.id
            });
        }

        // Scoped container is automatically garbage collected
    });

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