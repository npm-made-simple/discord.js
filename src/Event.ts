/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-function */

import { ClientEvents } from 'discord.js';

type ExecuteFunction<T> = (
    client: any,
    ...args: T extends keyof ClientEvents ? ClientEvents[T] : unknown[]
) => void | Promise<void>;

/**
 * An event builder for the Client.
 * @param name The name of the event. Must be a valid Discord.js Client Event.
 * @param once Whether the event should only be executed once. Optional.
 * @example
 * const event = new Event('ready', true)
 *     .setExecutor((client) => {
 *         console.log(`Logged in as ${client.user?.tag}!`);
 *     });
 * @extends "keyof ClientEvents"
 */
export class Event<EventName extends keyof ClientEvents> {
    execute: ExecuteFunction<EventName> = () => {};
    once = false;

    constructor(readonly name: EventName, once?: boolean) {
        if (once !== undefined) this.once = once;
    }

    /**
     * Describes whether the event should only be executed once.
     * @param once Whether the event should only be executed once.
     * @example
     * const event = new Event('ready')
     *     .setOnce(true);
     */
    setOnce(once: boolean): Event<EventName> {
        this.once = once;
        return this;
    }

    /**
     * Sets the executor for the event.
     * @param executor The executor function.
     * @example
     * const event = new Event('ready')
     *     .setExecutor((client) => {
     *         console.log(`Logged in as ${client.user?.tag}!`);
     *     });
     */
    setExecutor(executor: ExecuteFunction<EventName>): Event<EventName> {
        this.execute = executor;
        return this;
    }
}
