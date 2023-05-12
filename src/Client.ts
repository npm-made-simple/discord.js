/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    Collection,
    Client as DiscordClient,
    ChatInputCommandInteraction,
    GatewayIntentBits,
    REST,
    Routes,
    Snowflake,
    ClientEvents,
    Partials
} from 'discord.js';
import { Command, Subcommand, SubcommandGroup } from './Command.js';
import { Event } from './Event.js';
import { PathLike, readdirSync } from 'node:fs';
import { tag, prefix } from './logger.js';
import chalk from 'chalk';

export interface ClientExtensions {
    db?: any;
}

export interface ClientOptions {
    intents: (keyof typeof GatewayIntentBits)[];
    partials: (keyof typeof Partials)[];
}

/**
 * A client wrapper for the Discord.js client.
 * @example
 * import { Client } from '@made-simple/discord.js';
 * // Create a new client with the Guilds intent.
 * const client = new Client(['Guilds']);
 * // Add a sample command.
 * client.addCommand(
 *     new Command('ping')
 *         .setDescription('Replies with pong.')
 *         .setExecutor(async (client, interaction) => {
 *             await interaction.reply('Pong!');
 *         })
 * );
 * // Finally login to the client.
 * client.login();
 * @extends DiscordClient
 */
export class Client<Ext extends ClientExtensions> extends DiscordClient {
    readonly commands = new Collection<string, Command>();

    constructor(options: Partial<ClientOptions>, readonly db?: Ext['db']) {
        options.intents ??= [];
        const intents = options.intents.map((i) => GatewayIntentBits[i]);
        const partials = options.partials?.map((p) => Partials[p]);

        super({
            intents,
            partials
        });
    }

    /**
     * Adds an event to the client.
     * @param event The event to add.
     * @example
     * client.addEvent(
     *     new Event('ready', true)
     *         .setExecutor((client) => {
     *             console.log(`Logged in as ${client.user?.tag}!`);
     *         })
     * );
     * @template EventName The name of the event.
     */
    addEvent<EventName extends keyof ClientEvents>(
        event: Event<EventName>
    ): Client<Ext> {
        console.log(tag.info(), `Adding event ${chalk.blue(event.name)}`);
        this[event.once ? 'once' : 'on'](event.name, (...args) =>
            event.execute(
                this,
                ...(args as EventName extends keyof ClientEvents
                    ? ClientEvents[EventName]
                    : unknown[])
            )
        );
        return this;
    }

    /**
     * Adds a command to the client.
     * @param command The command to add.
     * @example
     * client.addCommand(
     *     new Command('ping')
     *         .setDescription('Replies with pong.')
     *         .setExecutor(async (client, interaction) => {
     *             await interaction.reply('Pong!');
     *         })
     * );
     */
    addCommand(command: Command): Client<Ext> {
        console.log(tag.info(), `Adding command ${chalk.blue(command.name)}`);
        this.commands.set(command.name, command);
        return this;
    }

    /**
     * Recursively adds all events from the given directory.
     * @param directory The directory to add events from.
     * @example
     * const { join } = require('path');
     * client.addEventsFolder(join(__dirname, 'events'));
     */
    async addEventsFolder(directory: PathLike): Promise<Client<Ext>> {
        console.log(
            tag.info(),
            `Adding events from ${chalk.green(directory)}...`
        );
        const files = readdirSync(directory);
        for (const file of files) {
            if (file.endsWith('.js')) {
                const eventFile = new URL(file, directory.toString());
                const event: Event<keyof ClientEvents> = (
                    await import(eventFile.toString())
                ).default;
                this.addEvent(event);
            }
        }

        return this;
    }

    /**
     * Recursively adds all commands from the given directory.
     * @param directory The directory to add commands from.
     * @example
     * const { join } = require('path');
     * client.addCommandsFolder(join(__dirname, 'commands'));
     */
    async addCommandsFolder(directory: PathLike): Promise<Client<Ext>> {
        console.log(
            tag.info(),
            `Adding commands from ${chalk.green(directory)}...`
        );
        const files = readdirSync(directory);
        for (const file of files) {
            if (file.endsWith('.js')) {
                const commandFile = new URL(file, directory.toString());
                const command: Command = (await import(commandFile.toString()))
                    .default;
                this.addCommand(command);
            } else if (!file.match(/\.w+$/)) {
                const subpath = new URL(file, directory.toString());
                const subfiles = readdirSync(subpath).filter((file) =>
                    file.endsWith('.js')
                );

                const commandPath = new URL(file + '/index.js', subpath);
                const command: SubcommandGroup = (
                    await import(commandPath.toString())
                ).default;
                console.log(
                    tag.info(),
                    `Found subcommand group ${chalk.blue(command.name)}...`
                );
                for (const subfile of subfiles) {
                    if (subfile === 'index.js') continue;

                    const subcommandPath = new URL(
                        `${file}/${subfile}`,
                        subpath
                    );
                    const subcommand: Subcommand = (
                        await import(subcommandPath.toString())
                    ).default;
                    console.log(
                        tag.info(),
                        `Loading subcommand ${chalk.blue(subcommand.name)}...`
                    );
                    command.addSubcommand(subcommand);
                }

                this.addCommand(command);
            }
        }

        return this;
    }

    /**
     * Registers all commands to Discord, also listens for the interactionCreate event.
     * @param guildId The guild ID to register commands to. Optional.
     * @param clientId The client ID to register commands to. Optional.
     * @param token The token to register commands to. Optional.
     * @example
     * client.registerCommands('1585766234563');
     */
    async registerCommands(
        guildId?: Snowflake,
        clientId?: Snowflake,
        token?: string
    ): Promise<Client<Ext>> {
        this.addEvent(
            new Event('interactionCreate').setExecutor(
                async (_, interaction) => {
                    if (!interaction.isCommand()) return;

                    const command = this.commands.get(interaction.commandName);
                    if (!command) return;

                    try {
                        await command.execute(
                            this,
                            interaction as ChatInputCommandInteraction
                        );
                    } catch (err) {
                        console.error(err);
                        await interaction.reply({
                            content:
                                'There was an error while executing this command.',
                            ephemeral: true
                        });
                    }
                }
            )
        );

        token = token ?? this.token ?? process.env.DISCORD_TOKEN;
        clientId = clientId ?? this.user?.id ?? process.env.CLIENT_ID;

        if (!token) throw new Error('No token provided.');
        if (!clientId) throw new Error('No client ID provided.');

        const rest = new REST({ version: '10' }).setToken(token);

        const commands = Array.from(this.commands.values()).map((command) => {
            return command.toJSON();
        });

        try {
            console.log(
                tag.info(),
                'Started refreshing application commands...'
            );
            if (guildId)
                await rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    {
                        body: commands
                    }
                );
            else
                await rest.put(Routes.applicationCommands(clientId), {
                    body: commands
                });
            console.log(
                tag.info(),
                'Successfully reloaded application commands!'
            );
        } catch (err) {
            console.error(prefix('ERROR', chalk.bgRed.black), err);
        }

        return this;
    }

    /**
     * Logs the client in, also listens for the ready and error events.
     * @param token The token to login with. Optional.
     * @example
     * client.login('your token here')
     */
    async login(token?: string): Promise<string> {
        token = token ?? this.token ?? process.env.DISCORD_TOKEN;
        if (!token) throw new Error('No token provided.');

        this.addEvent(
            new Event('ready', true).setExecutor(() => {
                console.log(
                    prefix('ONLINE', chalk.bgGreen.black),
                    chalk.magenta(this.user?.tag),
                    'is now online!'
                );
            })
        );

        this.addEvent(new Event('error').setExecutor(console.error));

        return super.login(token);
    }
}
