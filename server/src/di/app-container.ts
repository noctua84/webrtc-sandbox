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
import {RoomRepository} from "../db/repository/room.repository";
import {
    analyticsRangeSchema,
    bookParticipantSchema,
    cancelBookingSchema, closeEventSchema,
    createEventSchema, eventFiltersSchema,
    joinEventSchema, updateEventSchema
} from "../validation/event.shema";
import {EventManager} from "../event/manager";
import {EventRepository} from "../db/repository/event.repository";

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
            // event validation schemas
            createEvent: createEventSchema,
            bookParticipant: bookParticipantSchema,
            cancelBooking: cancelBookingSchema,
            joinEvent: joinEventSchema,
            closeEvent: closeEventSchema,
            updateEvent: updateEventSchema,
            eventFilters: eventFiltersSchema,
            analyticsRange: analyticsRangeSchema,
        }
    })

    // Register Prisma client
    // This should be done after the config and logger are registered
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

    // Register repositories
    // These should be registered after the Prisma client is available
    // Add additional repositories as needed.
    container.register('messageRepository', (c) => {
        const logger = c.get<'logger'>('logger');
        const prisma = c.get<'prisma'>('prisma');

        return new MessageRepository(logger, prisma);
    })

    container.register('roomRepository', (c) => {
        const logger = c.get<'logger'>('logger');
        const prisma = c.get<'prisma'>('prisma');
        const config = c.get<'config'>('config');

        return new RoomRepository(prisma, logger, config);
    })

    container.register('eventRepository', (c) => {
        const logger = c.get<'logger'>('logger');
        const prisma = c.get<'prisma'>('prisma');
        const config = c.get<'config'>('config');

        return new EventRepository(prisma, logger);
    })

    // Register managers
    // These should be registered after the repositories are available
    // Add additional managers as needed.
    container.register('roomManager', (c) => {
        const repository = c.get<'roomRepository'>('roomRepository');
        const metrics = c.get<'metrics'>('metrics');
        const logger = c.get<'logger'>('logger');
        const config = c.get<'config'>('config');

        return new RoomManager(repository, logger, config);
    })

    container.register('chatManager', (c) => {
        const metrics = c.get<'metrics'>('metrics');
        const repository = c.get<'messageRepository'>('messageRepository');
        const logger = c.get<'logger'>('logger');

        return new ChatManager(metrics, repository, logger);
    })

    container.register('eventManager', (c) => {
        const repository = c.get<'eventRepository'>('eventRepository');
        const logger = c.get<'logger'>('logger');
        const config = c.get<'config'>('config');
        const roomManager = c.get<'roomManager'>('roomManager');

        return new EventManager(repository, roomManager, logger, config);
    })

    return container;
}