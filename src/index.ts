import {
    ApplicationCommandType,
    Awaitable,
    ClientEvents,
    CommandInteraction,
    ContextMenuCommandBuilder,
    Client as DiscordClient,
    ClientOptions as DiscordClientOptions,
    Events,
    GatewayIntentBits,
    InteractionReplyOptions,
    InteractionResponse,
    Message,
    MessagePayload,
    Partials,
    PermissionsBitField,
    REST,
    Routes,
    SlashCommandBuilder,
    SlashCommandSubcommandBuilder
} from "discord.js";
import logger from "@made-simple/logging";
import Store from "@made-simple/sqlite-store";

import { Dirent, readdirSync } from "node:fs";

export interface ClientOptions extends Omit<DiscordClientOptions, "intents" | "partials"> {
    intents: (keyof typeof GatewayIntentBits | GatewayIntentBits)[];
    partials: (keyof typeof Partials | Partials)[];
}

export type EmitListener<T extends keyof ClientEvents> = (client: Client, ...args: ClientEvents[T]) => Awaitable<void>;

export interface EventData<T extends keyof ClientEvents> {
    name: T;
    once?: boolean;
    execute: EmitListener<T>;
}

export interface CommandData {
    data: SlashCommandBuilder;
    permissions?: Readonly<PermissionsBitField>;
    execute: EmitListener<Events.InteractionCreate>;
}

export interface SubcommandGroupData {
    data: SlashCommandBuilder;
    permissions?: Readonly<PermissionsBitField>;
    subcommands?: Map<string, SubcommandData>;
    execute: EmitListener<Events.InteractionCreate>;
}

export interface SubcommandData {
    data: SlashCommandSubcommandBuilder;
    execute: EmitListener<Events.InteractionCreate>;
}

export interface ContextMenuData<T extends keyof typeof ApplicationCommandType = keyof typeof ApplicationCommandType> {
    data: ContextMenuCommandBuilder;
    type: T;
    permissions?: Readonly<PermissionsBitField>;
    execute: EmitListener<Events.InteractionCreate>;
}

/**
 * Replies to an interaction with a message. Primarily used internally but exported JIC.
 * If the interaction is deferred or already replied to, it will follow up instead.
 * @param {CommandInteraction} interaction The interaction to reply to.
 * @param {string | MessagePayload | InteractionReplyOptions} options The options for the reply.
 * @returns {Promise<Message<boolean>> | Promise<InteractionResponse<boolean>>}
 * @example
 * reply(interaction, "Hello, world!");
 * reply(interaction, { content: "This would be followed up!", ephemeral: true });
 */
export function reply(interaction: CommandInteraction, options: string | MessagePayload | InteractionReplyOptions): Promise<Message<boolean>> | Promise<InteractionResponse<boolean>> {
    if (interaction.deferred || interaction.replied) return interaction.followUp(options);
    return interaction.reply(options);
}

const activeRegex = /^[^_].+\s.js$/;
const activeFolderRegex = /^[^_]/;
function isActiveFile(file: Dirent): false | RegExpMatchArray | null {
    return file.isFile() && file.name.match(activeRegex);
}

function iterateDirent<T>(url: URL, callback: (data: T) => void) {
    const files = readdirSync(url, { withFileTypes: true });
    files.forEach(async file => {
        if (file.isDirectory() && file.name.match(activeFolderRegex)) {
            const subURL = new URL(file.name, url);
            iterateDirent(subURL, callback);
        } else if (file.name.match(activeRegex)) {
            const data: T = (await import(`${url}/${file.name}`)).default;
            callback(data);
        }
    });
}

function sleep(s: number): number {
    const start = new Date().getTime();
    let completed = false;

    new Promise(resolve => setTimeout(resolve, s * 1000)).finally(() => {
        completed = true;
    });

    while (!completed) continue;
    const end = new Date().getTime();
    return (end - start) / 1000;
}

/**
 * The client class for the bot.
 * @template T - The type of the database store.
 * @extends DiscordClient
 * @example
 * const client = new Client({
 *     intents: ["Guilds", "GuildMessages"],
 *     partials: ["MessageContent"]
 * });
 */
export class Client<T extends {} = {}> extends DiscordClient {
    store = new Store<T>("database");
    commands = new Map<string, CommandData | SubcommandGroupData>();
    contexts = {
        User: new Map<string, ContextMenuData<"User">>(),
        Message: new Map<string, ContextMenuData<"Message">>(),
    }

    /**
     * Creates a new client instance.
     * @param {ClientOptions} options The options for the client.
     * @example
     * const client = new Client({
     *     intents: ["Guilds", "GuildMessages"],
     *     partials: ["MessageContent"]
     * });
     */
    constructor(options: ClientOptions) {
        let intents: GatewayIntentBits[] = [];
        for (const intent of options.intents) {
            if (typeof intent === "string") intents.push(GatewayIntentBits[intent]);
            else intents.push(intent);
        }

        let partials: Partials[] = [];
        for (const partial of options.partials) {
            if (typeof partial === "string") partials.push(Partials[partial]);
            else partials.push(partial);
        }

        super({
            ...options,
            intents,
            partials
        });
    }

    /**
     * Adds an event listener to the client.
     * @param {keyof ClientEvents} event The event to listen for.
     * @param {EmitListener<T>} listener The listener for the event.
     * @returns {this}
     * @example
     * client.on("ready", client => {
     *     console.log(`Logged in as ${client.user.tag}`);
     * });
     * 
     * // Supports (and prefers) Events enum
     * client.on(Events.InteractionCreate, async (client, interaction) => {
     *     // Handle interaction
     * });
     */
    on<T extends keyof ClientEvents>(event: T, listener: EmitListener<T>): this {
        super.on(event, (...args: ClientEvents[T]) => listener(this, ...args));
        return this;
    }

    /**
     * Adds a one-time event listener to the client.
     * @param {keyof ClientEvents} event The event to listen for.
     * @param {EmitListener<T>} listener The listener for the event.
     * @returns {this}
     * @example
     * client.once("ready", client => {
     *     console.log(`Logged in as ${client.user.tag}`);
     * });
     */
    once<T extends keyof ClientEvents>(event: T, listener: EmitListener<T>): this {
        super.once(event, (...args: ClientEvents[T]) => listener(this, ...args));
        return this;
    }

    /**
     * Loads events from a directory recursively.
     * Ignores files and directories starting with an underscore.
     * @param {URL} url The URL of the directory to load events from.
     * @returns {this}
     * @example
     * client.loadEventsFrom(new URL("./events", import.meta.url));
     */
    loadEventsFrom(url: URL): this {
        iterateDirent<EventData<keyof ClientEvents>>(url, event => {
            this[event.once ? "once" : "on"](event.name, event.execute);
            logger.debug(`Loaded event ${event.name}`);
        });

        return this;
    }

    /**
     * Loads context menus from a directory recursively.
     * Ignores files and directories starting with an underscore.
     * @param {URL} url The URL of the directory to load context menus from.
     * @returns {this}
     * @example
     * client.loadContextMenusFrom(new URL("./context-menus", import.meta.url));
     */
    loadContextMenusFrom(url: URL): this {
        iterateDirent<ContextMenuData>(url, context => {
            this.contexts[context.type].set(context.data.name, context);
            logger.debug(`Loaded context menu ${context.data.name}`);
        });

        return this;
    }

    /**
     * Loads commands from a directory recursively.
     * Subcommands are loaded from subdirectories and automatically added to the "parent" `index.js` file.
     * Ignores files and directories starting with an underscore.
     * @param {URL} url The URL of the directory to load commands from.
     * @returns {this}
     * @example
     * client.loadCommandsFrom(new URL("./commands", import.meta.url));
     */
    loadCommandsFrom(url: URL): this {
        const commandFiles = readdirSync(url, { withFileTypes: true });
        commandFiles.forEach(async file => {
            if (file.isDirectory() && file.name.match(activeFolderRegex)) {
                const subURL = new URL(file.name, url);
                const command: SubcommandGroupData = (await import(`${subURL}/index.js`)).default;
                command.subcommands ??= new Map();
                command.execute ??= async (client, interaction) => {
                    if (!interaction.isChatInputCommand()) return;
                    const subcommandName = interaction.options.getSubcommand();
                    const subcommand = command.subcommands!.get(subcommandName);

                    if (!subcommand) {
                        await reply(interaction, {
                            content: `Could not find subcommand **${subcommandName}**!`,
                            ephemeral: true
                        });

                        return;
                    }

                    try {
                        await subcommand.execute(client, interaction);
                    } catch (error) {
                        logger.error(error);
                        await reply(interaction, {
                            content: "There was an error while executing this command!",
                            ephemeral: true
                        });
                    }
                }

                const subcommandFiles = readdirSync(subURL, { withFileTypes: true }).filter(isActiveFile);
                subcommandFiles.forEach(async subfile => {
                    if (subfile.name === "index.js") return;
                    const subcommand: SubcommandData = (await import(`${subURL}/${subfile.name}`)).default;
                    command.data.addSubcommand(subcommand.data);
                    command.subcommands!.set(subcommand.data.name, subcommand);
                    logger.debug(`Loaded subcommand ${subcommand.data.name} for ${command.data.name}`);
                });

                this.commands.set(command.data.name, command);
                logger.debug(`Loaded command ${command.data.name}`);
            } else if (file.name.match(activeRegex)) {
                const command: CommandData = (await import(`${url}/${file.name}`)).default;
                this.commands.set(command.data.name, command);
                logger.debug(`Loaded command ${command.data.name}`);
            }
        });

        return this;
    }

    /**
     * Logs the client in and registers interactions if they've been changed.
     * @param {string} [token] The token to log in with. Defaults to the `DISCORD_TOKEN` environment variable.
     * @returns {Promise<string>} The token used to log in.
     * @example
     * client.login();
     */
    async login(token?: string): Promise<string> {
        token ??= process.env.DISCORD_TOKEN;
        await super.login(token);

        const isTestEnv = process.env.NODE_ENV === "development";
        const clientId = process.env.CLIENT_ID ?? this.user?.id;
        const guildId = process.env.TEST_GUILD_ID;

        if (!token || !clientId) {
            logger.error("No token or client ID was provided!");
            process.exit(1);
        }

        if (isTestEnv && !guildId) {
            logger.warn("No guild ID was provided for the test environment!\nCommands will be registered globally in 5 seconds.");
            sleep(5);
        }

        logger.debug("Checking if interactions need to be registered...");
        const commands = Array.from(this.commands.values()).map(command => command.data.toJSON());
        const userContexts = Array.from(this.contexts.User.values()).map(context => context.data.toJSON());
        const messageContexts = Array.from(this.contexts.Message.values()).map(context => context.data.toJSON());
        const all = [...commands, ...userContexts, ...messageContexts];

        const parsedString = JSON.stringify(all, null, 4)
            .replace(/"([^"]+)":/g, "$1:")
            .replace(/\s/g, "");

        if (this.store.get("%registered_applications%", "") === parsedString && parsedString !== "") {
            logger.debug("Interactions are already registered!");
            return token;
        }

        logger.debug("Registering interactions...");
        const rest = new REST().setToken(token);

        try {
            if (isTestEnv && guildId) await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: all });
            else await rest.put(Routes.applicationCommands(clientId), { body: all });
            this.store.set("%registered_applications%", parsedString);
            logger.debug("Interactions have been registered!");
        } catch (error) {
            logger.error(error);
            process.exit(1);
        }

        return token;
    }
}

export * from "discord.js";
