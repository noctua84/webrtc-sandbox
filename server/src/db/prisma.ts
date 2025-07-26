import {PrismaClient} from "@prisma/client";

/**
 * Creates a new PrismaClient instance with the provided configuration.
 *
 * @param config - Configuration object containing database connection details.
 * @returns {PrismaClient} - A new instance of PrismaClient.
 */
export const createPrismaClient = (config: any): PrismaClient => {
    return new PrismaClient({
        log: config.isDevelopment ? ['query', 'info', 'warn', 'error'] : ['error'],
        datasources: {
            db: {
                url: config.db.url
            }
        }
    });
}

/**
 * Connects to the Prisma database.
 *
 * @param prisma
 * @returns {Promise<void>}
 * @throws {Error} If the connection fails.
 */
export const connectPrisma = async (prisma: PrismaClient): Promise<void> => {
    try {
        await prisma.$connect();
        console.log('Prisma connected successfully');
    } catch (error) {
        console.error('Error connecting to Prisma:', error);
        throw error;
    }
}

/**
 * Disconnects from the Prisma database.
 *
 * @param prisma
 * @returns {Promise<void>}
 * @throws {Error} If the disconnection fails.
 */
export const disconnectPrisma = async (prisma: PrismaClient): Promise<void> => {
    try {
        await prisma.$disconnect();
        console.log('Prisma disconnected successfully');
    } catch (error) {
        console.error('Error disconnecting from Prisma:', error);
        throw error;
    }
}