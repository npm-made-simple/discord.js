import {
    Client as DiscordClient,
    Events,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder,
    type ApplicationCommandType,
    type AutocompleteInteraction,
    type Awaitable,
    type ChatInputCommandInteraction,
    type ClientEvents,
    type CommandInteraction,
    type ContextMenuCommandBuilder,
    type ClientOptions as DiscordClientOptions,
    type InteractionReplyOptions,
    type InteractionResponse,
    type Message,
    type MessagePayload,
    type PermissionsBitField,
    type SlashCommandOptionsOnlyBuilder,
    type SlashCommandSubcommandBuilder
} from "discord.js";

import { LoggerBuilder, chalk } from "@made-simple/logging";
import { dirent, thread } from "@made-simple/util";
import Store from "@made-simple/sqlite-store";
import { readdirSync } from "node:fs";

export interface ClientOptions extends Omit<DiscordClientOptions, "intents" | "partials"> {
    intents: (keyof typeof GatewayIntentBits | GatewayIntentBits)[];
    partials?: (keyof typeof Partials | Partials)[];
}

export type EmitListener<T extends keyof ClientEvents> = (client: Client, ...args: ClientEvents[T]) => Awaitable<void>;
export type TypedListener<T> = (client: Client, ...args: T[]) => Awaitable<void>;

export interface EventData<T extends keyof ClientEvents> {
    name: T;
    once?: boolean;
    execute: EmitListener<T>;
}

export interface CommandData {
    data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
    permissions?: Readonly<PermissionsBitField>;
    execute: TypedListener<ChatInputCommandInteraction>;
    autocomplete?: TypedListener<AutocompleteInteraction>;
}

export interface SubcommandGroupData {
    data: SlashCommandBuilder;
    permissions?: Readonly<PermissionsBitField>;
    subcommands?: Map<string, SubcommandData>;
    execute?: TypedListener<ChatInputCommandInteraction>;
    autocomplete?: TypedListener<AutocompleteInteraction>;
}

export interface SubcommandData {
    data: SlashCommandSubcommandBuilder;
    execute: TypedListener<ChatInputCommandInteraction>;
    autocomplete?: TypedListener<AutocompleteInteraction>;
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
 * 
 * ```ts
 * reply(interaction, "Hello, world!");
 * reply(interaction, { content: "This would be followed up!", ephemeral: true });
 * ```
 */
export function reply(interaction: CommandInteraction, options: string | MessagePayload | InteractionReplyOptions): Promise<Message<boolean>> | Promise<InteractionResponse<boolean>> {
    if (interaction.deferred || interaction.replied) return interaction.followUp(options);
    return interaction.reply(options);
}

/**
 * The client class for the bot.
 * @template T - The type of the database store.
 * @extends DiscordClient
 * 
 * ```ts
 * const client = new Client({
 *     intents: ["Guilds", "GuildMessages"],
 *     partials: ["MessageContent"]
 * });
 * ```
 */
export class Client<T extends {} = {}> extends DiscordClient {
    store = new Store<T>("database");
    commands = new Map<string, CommandData | SubcommandGroupData>();
    contexts = {
        User: new Map<string, ContextMenuData<"User">>(),
        Message: new Map<string, ContextMenuData<"Message">>(),
    }

    logger: LoggerBuilder;

    /**
     * Creates a new client instance.
     * @param {ClientOptions} options The options for the client.
     * 
     * ```ts
     * const client = new Client({
     *     intents: ["Guilds", "GuildMessages"],
     *     partials: ["MessageContent"]
     * });
     * ```
     */
    constructor(options: ClientOptions, logger?: LoggerBuilder) {
        let intents: GatewayIntentBits[] = [];
        for (const intent of options.intents) {
            if (typeof intent === "string") intents.push(GatewayIntentBits[intent]);
            else intents.push(intent);
        }

        let partials: Partials[] = [];
        if (!options.partials) options.partials = [];
        for (const partial of options.partials) {
            if (typeof partial === "string") partials.push(Partials[partial]);
            else partials.push(partial);
        }

        options.intents = intents;
        options.partials = partials;
        super(options as DiscordClientOptions);

        this.logger = logger ?? new LoggerBuilder("discord.js", chalk.cyanBright);
    }

    /**
     * Adds an event listener to the client.
     * @param {keyof ClientEvents} event The event to listen for.
     * @param {EmitListener<T>} listener The listener for the event.
     * @returns {this}
     * 
     * ```ts
     * client.on("ready", client => {
     *     console.log(`Logged in as ${client.user.tag}`);
     * });
     * 
     * // Supports (and prefers) Events enum
     * client.on(Events.InteractionCreate, async (client, interaction) => {
     *     // Handle interaction
     * });
     * ```
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
     * 
     * ```ts
     * client.once("ready", client => {
     *     console.log(`Logged in as ${client.user.tag}`);
     * });
     * ```
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
     *
     * ```ts
     * client.loadEventsFrom(new URL("./events", import.meta.url));
     * ```
     */
    loadEventsFrom(url: URL): this {
        dirent.iterate<EventData<keyof ClientEvents>>(url, event => {
            this[event.once ? "once" : "on"](event.name, event.execute);
            this.logger.debug(`Loaded event ${event.name}`);
        });

        return this;
    }

    /**
     * Loads context menus from a directory recursively.
     * Ignores files and directories starting with an underscore.
     * @param {URL} url The URL of the directory to load context menus from.
     * @returns {this}
     *
     * ```ts
     * client.loadContextMenusFrom(new URL("./context-menus", import.meta.url));
     * ```
     */
    loadContextMenusFrom(url: URL): this {
        dirent.iterate<ContextMenuData>(url, context => {
            this.contexts[context.type].set(context.data.name, context);
            this.logger.debug(`Loaded context menu ${context.data.name}`);
        });

        return this;
    }

    /**
     * Loads commands from a directory recursively.
     * Subcommands are loaded from subdirectories and automatically added to the "parent" `index.js` file.
     * Ignores files and directories starting with an underscore.
     * @param {URL} url The URL of the directory to load commands from.
     * @returns {this}
     * 
     * ```ts
     * client.loadCommandsFrom(new URL("./commands", import.meta.url));
     * ```
     */
    loadCommandsFrom(url: URL): this {
        const commandFiles = readdirSync(url, { withFileTypes: true });
        commandFiles.forEach(async file => {
            if (file.isDirectory() && dirent.isActive(file)) {
                const subURL = new URL(file.name, url);
                const command: SubcommandGroupData = (await import(`${subURL}/index.js`)).default;
                if (command.permissions) command.data.setDefaultMemberPermissions(command.permissions.bitfield);
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
                        this.logger.error(error);
                        await reply(interaction, {
                            content: "There was an error while executing this command!",
                            ephemeral: true
                        });
                    }
                }

                const subcommandFiles = readdirSync(subURL, { withFileTypes: true }).filter(dirent.isActive);
                subcommandFiles.forEach(async subfile => {
                    if (subfile.name === "index.js") return;
                    const subcommand: SubcommandData = (await import(`${subURL}/${subfile.name}`)).default;
                    command.data.addSubcommand(subcommand.data);
                    command.subcommands!.set(subcommand.data.name, subcommand);
                    this.logger.debug(`Loaded subcommand ${subcommand.data.name} for ${command.data.name}`);
                });

                this.commands.set(command.data.name, command);
                this.logger.debug(`Loaded command ${command.data.name}`);
            } else if (dirent.isActive(file)) {
                const command: CommandData = (await import(`${url}/${file.name}`)).default;
                if (command.permissions) command.data.setDefaultMemberPermissions(command.permissions.bitfield);
        
                this.commands.set(command.data.name, command);
                this.logger.debug(`Loaded command ${command.data.name}`);
            }
        });

        return this;
    }

    /**
     * Uses the default interaction handler for the client.
     * This will automatically handle commands and context menus
     * in the intended way. Do not use an `interactionCreate` event if using this.
     * @returns {this}
     * 
     * ```ts
     * client.useDefaultInteractionHandler();
     * // "[DEBUG] Using default interaction handler, do not use an 'interactionCreate' event listener!"
     * ```
     */
    useDefaultInteractionHandler(): this {
        this.logger.info("Using default interaction handler, do not use an 'interactionCreate' event listener!");
        this.on(Events.InteractionCreate, async (client, interaction) => {
            const { member } = interaction;

            if (interaction.isChatInputCommand()) {
                const { commandName } = interaction;
                const command = client.commands.get(commandName);

                if (!command) {
                    await interaction.reply({
                        content: `Could not find command **${commandName}**!`,
                        ephemeral: true
                    });

                    return;
                }

                if (command.permissions && !(member?.permissions as Readonly<PermissionsBitField>).has(command.permissions)) {
                    await interaction.reply({
                        content: "You do not have permission to use this command!",
                        ephemeral: true
                    });

                    return;
                }

                try {
                    await command.execute!(client, interaction);
                } catch (error) {
                    this.logger.error(error);
                    await reply(interaction, {
                        content: "There was an error while executing this command!",
                        ephemeral: true
                    });
                }
            } else if (interaction.isContextMenuCommand()) {
                const { commandName } = interaction;
                let type: "User" | "Message";
                if (interaction.isUserContextMenuCommand()) type = "User";
                else if (interaction.isMessageContextMenuCommand()) type = "Message";
                else return;

                const context = client.contexts[type].get(commandName);
                if (!context) {
                    await interaction.reply({
                        content: `Could not find context menu **${commandName}**!`,
                        ephemeral: true
                    });
                    
                    return;
                }

                if (context.permissions && !(member?.permissions as Readonly<PermissionsBitField>).has(context.permissions)) {
                    await interaction.reply({
                        content: "You do not have permission to use this context menu!",
                        ephemeral: true
                    });

                    return;
                }

                try {
                    await context.execute(client, interaction);
                } catch (error) {
                    this.logger.error(error);
                    await reply(interaction, {
                        content: "There was an error while executing this context menu!",
                        ephemeral: true
                    });
                }
            } else if (interaction.isAutocomplete()) {
                const { commandName } = interaction;
                const command = client.commands.get(commandName);

                if (!command || !command.autocomplete) return;

                try {
                    await command.autocomplete(client, interaction);
                } catch (error) {
                    this.logger.error(error);
                }
            }
        });

        return this;
    }

    /**
     * Logs the client in and registers interactions if they've been changed.
     * @param {string} [token] The token to log in with. Defaults to the `DISCORD_TOKEN` environment variable.
     * @returns {Promise<string>} The token used to log in.
     *
     * ```ts
     * client.login();
     * ```
     */
    async login(token?: string): Promise<string> {
        token ??= process.env.DISCORD_TOKEN;
        await super.login(token);

        const isTestEnv = process.env.NODE_ENV === "development";
        const clientId = process.env.CLIENT_ID ?? this.user?.id;
        const guildId = process.env.TEST_GUILD_ID;

        if (!token || !clientId) {
            this.logger.error("No token or client ID was provided!");
            process.exit(1);
        }

        if (isTestEnv && !guildId) {
            this.logger.warn("No guild ID was provided for the test environment!\nCommands will be registered globally in 5 seconds.");
            await thread.sleepAsync(5000);
        }

        this.logger.debug("Checking if interactions need to be registered...");
        const commands = Array.from(this.commands.values()).map(command => command.data.toJSON());
        const userContexts = Array.from(this.contexts.User.values()).map(context => context.data.toJSON());
        const messageContexts = Array.from(this.contexts.Message.values()).map(context => context.data.toJSON());
        const all = [...commands, ...userContexts, ...messageContexts];

        const parsedString = JSON.stringify(all, null, 4)
            .replace(/"([^"]+)":/g, "$1:")
            .replace(/\s/g, "");

        if (this.store.get("%registered_applications%", "") === parsedString && parsedString !== "") {
            this.logger.log("Interactions are currently up to date!");
            return token;
        }

        this.logger.info("Registering interactions...");
        const rest = new REST().setToken(token);

        try {
            if (isTestEnv && guildId) await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: all });
            else await rest.put(Routes.applicationCommands(clientId), { body: all });
            this.store.set("%registered_applications%", parsedString);
            this.logger.success("Interactions have been registered!");
        } catch (error) {
            this.logger.error(error);
            process.exit(1);
        }

        return token;
    }

    /**
     * Sets the logger for the client.
     * @param {LoggerBuilder} logger The logger to use.
     * @returns {this}
     * 
     * ```ts
     * const logger = new LoggerBuilder("MyBot", chalk.green);
     * client.setLogger(logger);
     * client.logger.info("Hello, world!");
     * // Prints: [MyBot] Hello, world!, in green
     * ```
     */
    setLogger(logger: LoggerBuilder): this {
        this.logger = logger;
        return this;
    }
}

export * from "discord.js";
export { SlashCommandBuilder };
