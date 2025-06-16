import { ApplicationCommandType, AutocompleteInteraction, Awaitable, ChatInputCommandInteraction, Client as DiscordClient, ClientEvents, ClientOptions as DiscordClientOptions, CommandInteraction, ContextMenuCommandBuilder, Events, GatewayIntentBits, InteractionReplyOptions, InteractionResponse, Message, MessageFlags, MessagePayload, ModalBuilder, Partials, PermissionsBitField, REST, Routes, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder, InteractionEditReplyOptions, AnySelectMenuInteraction, ButtonInteraction, ModalSubmitInteraction } from "discord.js";

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
export type InteractionWithArgsListener<T> = (client: Client, interaction: T, ...args: string[]) => Awaitable<void>;

export interface EventData<T extends keyof ClientEvents> {
    name: T;
    once?: boolean;
    execute: EmitListener<T>;
    interface: "EventData";
}

interface TopLevelCommandData {
    execute: TypedListener<ChatInputCommandInteraction>;
    autocomplete?: TypedListener<AutocompleteInteraction>;
    selectMenus?: {[key: string]: InteractionWithArgsListener<AnySelectMenuInteraction>};
    buttons?: {[key: string]: InteractionWithArgsListener<ButtonInteraction>};
    modals?: {[key: string]: InteractionWithArgsListener<ModalSubmitInteraction>};
}

export interface CommandData extends TopLevelCommandData {
    data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
    permissions?: Readonly<PermissionsBitField>;
    interface: "CommandData";
}

export interface SubcommandData extends TopLevelCommandData {
    data: SlashCommandSubcommandBuilder;
    interface: "SubcommandData";
}

export interface SubcommandIndexData {
    data: SlashCommandBuilder;
    permissions?: Readonly<PermissionsBitField>;
    subcommands?: Map<string, SubcommandData>;
    subcommandGroups?: Map<string, SubcommandGroupData>;
    execute?: TypedListener<ChatInputCommandInteraction>;
    interface: "SubcommandIndexData";
}

export interface SubcommandGroupData {
    data: SlashCommandSubcommandGroupBuilder;
    subcommands?: Map<string, SubcommandData>;
    execute?: TypedListener<ChatInputCommandInteraction>;
    interface: "SubcommandGroupData";
}

export interface ContextMenuData<T extends keyof typeof ApplicationCommandType = keyof typeof ApplicationCommandType> {
    data: ContextMenuCommandBuilder;
    type: T;
    permissions?: Readonly<PermissionsBitField>;
    execute: EmitListener<Events.InteractionCreate>;
    interface: "ContextMenuData";
}

export interface ModalData {
    data: ModalBuilder;
    execute: InteractionWithArgsListener<ModalSubmitInteraction>;
    interface: "ModalData";
}

export function EventData<T extends keyof ClientEvents>(data: Omit<EventData<T>, "interface">): EventData<T> {
    return { ...data, interface: "EventData" };
}

export function CommandData(data: Omit<CommandData, "interface">): CommandData {
    return { ...data, interface: "CommandData" };
}

export function SubcommandIndexData(data: Omit<SubcommandIndexData, "interface">): SubcommandIndexData {
    return { ...data, interface: "SubcommandIndexData" };
}

export function SubcommandGroupData(data: Omit<SubcommandGroupData, "interface">): SubcommandGroupData {
    return { ...data, interface: "SubcommandGroupData" };
}

export function SubcommandData(data: Omit<SubcommandData, "interface">): SubcommandData {
    return { ...data, interface: "SubcommandData" };
}

export function ContextMenuData<T extends keyof typeof ApplicationCommandType = keyof typeof ApplicationCommandType>(data: Omit<ContextMenuData<T>, "interface">): ContextMenuData<T> {
    return { ...data, interface: "ContextMenuData" };
}

export function ModalData(data: Omit<ModalData, "interface">): ModalData {
    return { ...data, interface: "ModalData" };
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
export function reply(interaction: CommandInteraction, options: string | MessagePayload | InteractionReplyOptions | InteractionEditReplyOptions): Promise<Message<boolean>> | Promise<InteractionResponse<boolean>> {
    if (interaction.deferred || interaction.replied) return interaction.editReply(options as string | MessagePayload | InteractionEditReplyOptions);
    return interaction.reply(options as string | MessagePayload | InteractionReplyOptions);
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
    commands = new Map<string, CommandData | SubcommandIndexData>();
    modals = new Map<string, ModalData>();
    contextMenus = {
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
        dirent.iterateOver<EventData<keyof ClientEvents>>(url, event => {
            this[event.once ? "once" : "on"](event.name, event.execute);
            this.logger.debug(`Loaded event ${event.name}`);
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
        const files = readdirSync(url, { withFileTypes: true });
        files.forEach(async file => {
            if (!dirent.isValidRegex(file)) return;
            const subURL = new URL(file.name, url);
            if (file.isDirectory()) this.loadSubcommand(subURL);
            else this.loadCommand(subURL);
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
        dirent.iterateOver<ContextMenuData>(url, context => {
            this.contextMenus[context.type].set(context.data.name, context);
            this.logger.debug(`Loaded context menu ${context.data.name}`);
        });

        return this;
    }

    /**
     * Loads modal from a directory recursively.
     * These modals will be used if one relating to a command cannot be found.
     * Ignores files and directories starting with an underscore.
     * @param {URL} url The URL of the directory to load modals from.
     * @returns {this}
     */
    loadModalsFrom(url: URL): this {
        dirent.iterateOver<ModalData>(url, modal => {
            const name = modal.data.data.custom_id ?? modal.data.data.title;
            if (!name) return;
            this.modals.set(name, modal)
        });

        return this;
    }

    /**
     * Uses the default interaction handler for the client.
     * This will automatically handle commands and context menus
     * in the intended way. Be careful when using the `interactionCreate` event if using this.
     * @returns {this}
     * 
     * ```ts
     * client.useDefaultInteractionHandler();
     * ```
     */
    useDefaultInteractionHandler(): this {
        this.logger.info("Using default interaction handler, be careful when using the 'interactionCreate' event listener!");
        this.on(Events.InteractionCreate, async (client, interaction) => {
            const { member } = interaction;

            if (interaction.isChatInputCommand()) {
                const { commandName } = interaction;
                const command = client.commands.get(commandName);

                if (!command) {
                    await interaction.reply({
                        content: `Could not find command **${commandName}**!`,
                        flags: [ MessageFlags.Ephemeral ]
                    });

                    return;
                }

                if (interaction.inGuild()) {
                    if (command.permissions && !(member?.permissions as Readonly<PermissionsBitField>).has(command.permissions)) {
                        await interaction.reply({
                            content: "You do not have permission to use this command!",
                            flags: [ MessageFlags.Ephemeral ]
                        });

                        return;
                    }
                }
                

                try {
                    await command.execute!(client, interaction);
                } catch (error) {
                    this.logger.error(error);
                    await reply(interaction, {
                        content: "There was an error while executing this command!",
                        flags: [ MessageFlags.Ephemeral ]
                    });
                }
            } else if (interaction.isContextMenuCommand()) {
                const { commandName } = interaction;
                let type: "User" | "Message";
                if (interaction.isUserContextMenuCommand()) type = "User";
                else if (interaction.isMessageContextMenuCommand()) type = "Message";
                else return;

                const context = client.contextMenus[type].get(commandName);
                if (!context) {
                    await interaction.reply({
                        content: `Could not find context menu **${commandName}**!`,
                        flags: [ MessageFlags.Ephemeral ]
                    });
                    
                    return;
                }

                if (context.permissions && !(member?.permissions as Readonly<PermissionsBitField>).has(context.permissions)) {
                    await interaction.reply({
                        content: "You do not have permission to use this context menu!",
                        flags: [ MessageFlags.Ephemeral ]
                    });

                    return;
                }

                try {
                    await context.execute(client, interaction);
                } catch (error) {
                    this.logger.error(error);
                    await reply(interaction, {
                        content: "There was an error while executing this context menu!",
                        flags: [ MessageFlags.Ephemeral ]
                    });
                }
            } else if (interaction.isAutocomplete()) {
                const { commandName, options } = interaction;
                const subcommand = options.getSubcommand(false);
                const group = options.getSubcommandGroup(false);

                const command = client.commands.get(commandName) as SubcommandIndexData;
                let autocomplete: TypedListener<AutocompleteInteraction> | undefined;
                if (!command) return;
                if (subcommand) {
                    if (group) autocomplete = command.subcommandGroups?.get(group)?.subcommands?.get(subcommand)?.autocomplete;
                    else autocomplete = command.subcommands?.get(subcommand)?.autocomplete;
                }

                if (!autocomplete) {
                    await interaction.respond([{
                        name: "ERROR",
                        value: "autocompleteNotFound"
                    }]);

                    return;
                }

                try {
                    await autocomplete(client, interaction);
                } catch (error) {
                    this.logger.error(error);
                }
            } else if (interaction.isAnySelectMenu() || interaction.isModalSubmit() || interaction.isButton()) {
                const { customId } = interaction;
                const args = customId.split("-");
                let lookup: "selectMenus" | "modals" | "buttons";

                if (interaction.isAnySelectMenu()) lookup = "selectMenus";
                else if (interaction.isModalSubmit()) lookup = "modals";
                else if (interaction.isButton()) lookup = "buttons";
                else return;

                const command = this.commands.get(args[0]);
                if (!command) {
                    if (!interaction.isModalSubmit()) return;
                    const modal = this.modals.get(args[0]);
                    if (!modal) return;
                    args.shift();

                    try {
                        await modal.execute(client, interaction, ...args.slice(1));
                    } catch (error) {
                        this.logger.error(error);
                    }

                    return;
                }

                if (command.interface === "CommandData") {
                    const i = command[lookup]?.[args[1]];
                    if (!i) return;

                    try {
                        await i(client, interaction as never, ...args.slice(2));
                    } catch (error) {
                        this.logger.error(error);
                    }

                    return;
                }

                const group = command.subcommandGroups?.get(args[1]);
                if (group) {
                    const subcommand = group.subcommands?.get(args[2]);
                    if (!subcommand) return;

                    const i = subcommand[lookup]?.[args[3]];
                    if (!i) return;

                    try {
                        await i(client, interaction as never, ...args.slice(4));
                    } catch (error) {
                        this.logger.error(error);
                    }

                    return;
                }

                const subcommand = command.subcommands?.get(args[1]);
                if (!subcommand) return;

                const i = subcommand[lookup]?.[args[2]];
                if (!i) return;

                try {
                    await i(client, interaction as never, ...args.slice(3));
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
        const userContexts = Array.from(this.contextMenus.User.values()).map(context => context.data.toJSON());
        const messageContexts = Array.from(this.contextMenus.Message.values()).map(context => context.data.toJSON());
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

    
    /**
     * Protected method to immediately register a subcommand / subcommand group.
     * Does not check if the file being loaded is not valid Regex.
     * Unlike `loadCommandsFrom` and most other methods, `loadSubcommand` does **not** return itself.
     * @param {URL} url The URL of the subcommand / group folder.
     * 
     * ```ts
     * client.loadSubcommand(new URL("./commands/modify/", import.meta.url));
     * ```
     */
    protected async loadSubcommand(url: URL) {
        const index: SubcommandIndexData = (await import(url + "/index.js")).default;
        if (index.permissions) index.data.setDefaultMemberPermissions(index.permissions.bitfield);
        index.subcommands ??= new Map();
        index.subcommandGroups ??= new Map();

        const files = readdirSync(url, { withFileTypes: true });
        files.forEach(async file => {
            if (file.name === "index.js" || !dirent.isValidRegex(file)) return;
            const subURL = new URL(file.name, url + "/");

            // Subcommand Groups
            if (file.isDirectory()) {
                const group: SubcommandGroupData = (await import(subURL + "/index.js")).default;
                group.subcommands ??= new Map();

                const groupFiles = readdirSync(subURL, { withFileTypes: true });
                groupFiles.forEach(async subfile => {
                    if (subfile.name === "index.js" || !dirent.isValidRegex(subfile)) return;
                    const subcommand: SubcommandData = (await import(subURL + "/" + subfile.name)).default;
                    group.data.addSubcommand(subcommand.data);
                    group.subcommands!.set(subcommand.data.name, subcommand);
                    this.logger.debug(`Loaded group subcommand ${group.data.name}.${subcommand.data.name} for ${index.data.name}`);
                });

                index.data.addSubcommandGroup(group.data);
                index.subcommandGroups!.set(group.data.name, group);
                this.logger.debug(`Loaded subcommand group ${group.data.name} for ${index.data.name}`);

            // Subcommands
            } else {
                const subcommand: SubcommandData = (await import(subURL.toString())).default;
                index.data.addSubcommand(subcommand.data);
                index.subcommands!.set(subcommand.data.name, subcommand);
                this.logger.debug(`Loaded subcommand ${subcommand.data.name} for ${index.data.name}`);
            }
        });

        index.execute ??= async (client, interaction) => {
            if (!interaction.isChatInputCommand()) return;
            const groupName = interaction.options.getSubcommandGroup();
            const name = interaction.options.getSubcommand();
            let subcommand: SubcommandData | undefined;

            if (groupName) {
                const group = index.subcommandGroups!.get(groupName);
                subcommand = group?.subcommands!.get(name);
            } else {
                subcommand = index.subcommands!.get(name);
            }

            if (!subcommand) {
                await reply(interaction, {
                    content: `Could not find subcommand **${name}**!`,
                    flags: [ MessageFlags.Ephemeral ]
                });

                return;
            }

            try {
                await subcommand.execute(client, interaction);
            } catch (error) {
                this.logger.error(error);
                await reply(interaction, {
                    content: "There was an error while executing this command!",
                    flags: [ MessageFlags.Ephemeral ]
                });
            }
        }

        this.commands.set(index.data.name, index);
        this.logger.debug("Loaded command " + index.data.name);
    }

    /**
     * Protected method to immediately register a command.
     * Does not check if the file being loaded is not valid Regex.
     * Unlike `loadCommandsFrom` and most other methods, `loadCommand` does **not** return itself.
     * @param {URL} url The URL of the command's file.
     * 
     * ```ts
     * client.loadCommand(new URL("./commands/ping.js", import.meta.url));
     * ```
     */
    protected async loadCommand(url: URL) {
        const command: CommandData = (await import(url.toString())).default;
        if (command.permissions) command.data.setDefaultMemberPermissions(command.permissions.bitfield);
        this.commands.set(command.data.name, command);
        this.logger.debug("Loaded comand " + command.data.name);
    }
}

export * from "discord.js";
export { SlashCommandBuilder };
