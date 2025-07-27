import {Container} from './container'
import {connectPrisma, createPrismaClient} from "../db/prisma";
import {getConfig} from "../config";
import {ServerLogger} from "../logger";
import {MetricsCollector} from "../metrics/collector";
import {MessageRepository} from "../db/repository/chat.repository";
import {
    addReactionSchema,
    deleteMessageSchema,
    editMessageSchema, removeReactionSchema,
    sendMessageSchema,
    typingIndicatorSchema
} from "../validation/chat.shema";
import {RoomManager} from "../room/manager";
import {ChatManager} from "../chat/manager";

export const createAppContainer = () => {
    const container = new Container();

    // Register system services here at the top level
    // Register config
    container.register('config', () => {
        return getConfig();
    })

    // Register logger
    container.register('logger', () => {
        return new ServerLogger()
    })

    // Register metrics collector
    container.register('metrics', () => {
        return new MetricsCollector();
    })

    // Register validation schemas
    container.register('schemas', () => {
        return {
            // Chat message validation schemas
            sendMessage: sendMessageSchema,
            editMessage: editMessageSchema,
            deleteMessage: deleteMessageSchema,
            typingIndicator: typingIndicatorSchema,
            addReaction: addReactionSchema,
            removeReaction: removeReactionSchema,
        }
    })

    // Register services here
    container.register('prisma', (c) => {
        const cfg = c.get<'config'>('config');
        const logger = c.get<'logger'>('logger');

        const prisma = createPrismaClient(cfg)

        connectPrisma(prisma).catch(err => {
            logger.error('Failed to connect to Prisma:', err);
            process.exit(1); // Exit the process if Prisma connection fails
        });

        return prisma;
    })

    container.register('messageRepository', (c) => {
        const logger = c.get<'logger'>('logger');
        const prisma = c.get<'prisma'>('prisma');

        return new MessageRepository(logger, prisma);
    })

    container.register('roomManager', (c) => {
        const prisma = c.get<'prisma'>('prisma');
        const logger = c.get<'logger'>('logger');

        return new RoomManager();
    })

    container.register('chatManager', (c) => {
        const metrics = c.get<'metrics'>('metrics');
        const repository = c.get<'messageRepository'>('messageRepository');
        const logger = c.get<'logger'>('logger');

        return new ChatManager(metrics, repository, logger);
    })

    return container;
}