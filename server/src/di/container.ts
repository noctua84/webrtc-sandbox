import {ServiceRegistry} from "./types";

export type ServiceDefinition<T = any> = {
    factory: (container: Container) => T;
    singleton?: boolean;
}

// Helper type to extract the correct return type
type ServiceReturnType<T> = T extends (...args: any[]) => infer R ? R : T;
type ResolvedServiceType<T extends keyof ServiceRegistry> = ServiceReturnType<NonNullable<ServiceRegistry[T]>>;


export class Container {
    private services: Map<string, ServiceDefinition> = new Map();
    private instances: Map<string, any> = new Map();
    private building: Set<string> = new Set();

    /**
     * Creates a new dependency injection container.
     * @param name
     * @param factory
     * @param singleton
     * @returns {Container} The container instance.
     */
    register<T extends keyof ServiceRegistry>(name: string, factory: (container: Container) => ResolvedServiceType<T>, singleton: boolean = true): this {
        this.services.set(name, { factory, singleton });
        return this;
    }

    /**
     * Register a pre-created instance.
     * @param name
     * @param value
     */
    set<T extends keyof ServiceRegistry>(name: string, value: ResolvedServiceType<T>): this {
        this.instances.set(name, value);
        return this;
    }

    /**
     * Retrieves a service from the container (create if needed).
     * @param name
     */
    get<T extends keyof ServiceRegistry>(name: string): ResolvedServiceType<T> {
        // Check if the service is already registered
        if (this.instances.has(name)) {
            return this.instances.get(name);
        }

        // Check if the service is being built to prevent circular dependencies
        if (this.building.has(name)) {
            throw new Error(`Circular dependency detected for service: ${name}`);
        }

        const service = this.services.get(name);
        if (!service) {
            throw new Error(`Service not found: ${name}`);
        }

        try {
            // Mark the service as being built
            this.building.add(name);

            // Create the service instance using the factory function
            const instance = service.factory(this);

            // check if singleton:
            if (service.singleton) {
                this.instances.set(name, instance);
            }

            this.building.delete(name);

            return instance;
        } catch (error: any) {
            this.building.delete(name);
            throw new Error(`Error creating service ${name}: ${error.message}`);
        }
    }

    /**
     * Creates a new scope/container that inherits services from the parent container.
     */
    createScope(): Container {
        const scope = new Container()

        for (const [name, service] of this.services) {
            scope.services.set(name, service);
        }

        return scope;
    }

    /**
     * Creates a factory function that resolves dependencies from the container.
     * @param fn
     * @param dependencies
     */
    factory<T extends (...args: any[]) => any>(fn: T, dependencies: string[]): () => ReturnType<T> {
        return () => {
            const resolvedDependencies = dependencies.map(dep => this.get(dep));
            return fn(...resolvedDependencies);
        }
    }
}