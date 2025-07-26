import {Container, ServiceDefinition} from './container'

/**
 * Creates a handler function with dependency injection.
 * This function takes an array of dependency names and a handler function.
 * The handler function will be called with the resolved dependencies from the container.
 *
 * @param dependencies
 * @param handler
 */
export function createHandler<T extends any[], R>(dependencies: string[], handler: (...deps: T) => (...args: T) => R) {
    return function (container: Container) {
        // Resolve dependencies from the container
        const resolvedDependencies: any = dependencies.map(dep => container.get(dep));

        // Call the handler with resolved dependencies and original arguments
        return handler(...resolvedDependencies);
    };
}

/**
 * Creates a service registration helper for cleaner syntax.
 * This allows you to register services with a factory function and a singleton flag.
 *
 * @param factory
 * @param singleton
 */
export function service<T>(factory: (container: Container) => T, singleton: boolean = true): ServiceDefinition<T> {
    return {
        factory,
        singleton
    };
}

/**
 * Creates a value registration helper
 * This allows you to register a pre-created value in the container.
 *
 * @param value
 */
export function value<T>(value: T): ServiceDefinition<T> {
    return {
        factory: () => value,
        singleton: true
    };
}