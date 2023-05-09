import { ChatInputCommandInteraction, Collection, Client as DiscordClient, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Snowflake } from 'discord.js';
import { dirname, join } from 'node:path';
import { readdirSync } from 'node:fs';
import callsite from 'callsite';
import { Command, Event, Modal, SlashCommandOptions, Subcommand, SubcommandCommand } from '.';

class Client<DB> extends DiscordClient {
    readonly commands = new Collection<string, Command>();
    readonly modals = new Collection<string, Modal>();

    private hasModals = false;
    private readonly caller = dirname(callsite()[2].getFileName());

    constructor(intents: (keyof typeof GatewayIntentBits)[], readonly db?: DB) {
        super({ intents });
    }

    addModal(name: string, data: Modal) {
        this.hasModals = true;
        this.modals.set(name, data);
    }

    addModalsFolder(path: string) {
        path = join(this.caller, path);

        const files = readdirSync(path).filter(file => file.endsWith('.js'));
        for (const file of files) {
            const modal: Modal = require(join(path, file));
            this.addModal(file.split('.')[0], modal);
        }
    }

    private registerModals() {
        this.on('interactionCreate', async (interaction) => {
            if (!interaction.isModalSubmit()) return;

            const data = interaction.customId.split('|');
            const modal = this.modals.get(data[0]);
            if (!modal) return;

            try {
                await modal.execute(this, interaction, ...data.slice(1));
            } catch (err) {
                console.error(err);
                await interaction.reply({
                    content: 'There was an error while receiving this modal!',
                    ephemeral: true
                });
            }
        });
    }

    addCommand(name: string, data: Command) {
        if (!data.builder) {
            data.builder = new SlashCommandBuilder()
                .setName(name)
                .setDescription(data.description);

            if (data.args) {
                for (const arg of data.args) {
                    const type = arg.type ?? 'string';

                    try {
                        const argBuilder: SlashCommandOptions = (data.builder as any)[`add${type[0].toUpperCase() + type.slice(1)}Option`]((o: SlashCommandOptions) => o.setName(arg.name))
                            .setDescription(arg.description)
                            .setRequired(arg.required ?? false);

                        for (const key in arg) {
                            if (key === 'name' || key === 'description' || key === 'required' || key === 'type') continue;
                            (argBuilder as any)[`set${key[0].toUpperCase() + key.slice(1)}`](arg[key]);
                        }
                    } catch (err) {
                        console.error(`Invalid argument type: ${type}`);
                    }
                }
            }
        }

        if (data.allowedInDMs !== undefined) data.builder?.setDMPermission(data.allowedInDMs);
        if (data.permissionsRequired !== undefined) data.builder?.setDefaultMemberPermissions(data.permissionsRequired);
        this.commands.set(name, data);
    }

    addCommandsFolder(path: string) {
        path = join(this.caller, path);

        const files = readdirSync(path);
        for (const file of files) {
            if (file.endsWith('.js')) {
                const command: Command = require(join(path, file));
                this.addCommand(file.split('.')[0], command);
            } else if (file.startsWith('.')) {
                const subpath = join(path, file);
                const subfiles = readdirSync(subpath).filter(file => file.endsWith('.js'));

                const command = require(join(subpath, 'index.js')) as Command & SubcommandCommand;
                const subcommands = new Collection<string, Subcommand>();
                for (const subfile of subfiles) {
                    if (subfile === 'index.js') continue;

                    const subcommand: Subcommand = require(join(subpath, subfile));
                    subcommands.set(subfile.split('.')[0], subcommand);
                    command.builder.addSubcommand(subcommand.builder);
                }

                command.subcommands = subcommands;
                command.execute = async (client, interaction) => {
                    const subcommand = interaction.options.getSubcommand();
                    if (!subcommand) return await interaction.reply({
                        content: 'You must provide a subcommand!',
                        ephemeral: true
                    });

                    const data = subcommands.get(subcommand);
                    if (!data) return await interaction.reply({
                        content: 'That subcommand does not exist!',
                        ephemeral: true
                    });

                    try {
                        await data.execute(client, interaction);
                    } catch (err) {
                        const content = `There was an error while executing this command!\n\`\`\`${err}\`\`\``;
                        try {
                            await interaction.reply({ content, ephemeral: true });
                        } catch (_) {
                            try {
                                await interaction.followUp({ content, ephemeral: true });
                            } catch (_) {
                                interaction.channel?.send(content);
                            }
                        }

                        console.error(err);
                    }
                }

                this.addCommand(file, command);
            }
        }
    }

    async registerCommands(guildId: Snowflake) {
        this.on('interactionCreate', async (interaction) => {
            if (!interaction.isCommand()) return;

            const command = this.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(this, interaction as ChatInputCommandInteraction);
            } catch (err) {
                const content = `There was an error while executing this command!\n\`\`\`${err}\`\`\``;
                try {
                    await interaction.reply({ content, ephemeral: true });
                } catch (_) {
                    try {
                        await interaction.followUp({ content, ephemeral: true });
                    } catch (_) {
                        interaction.channel?.send(content);
                    }
                }

                console.error(err);
            }
        });

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN
            ?? process.env.TOKEN
            ?? this.token
            ?? '');
        const commands = Array.from(this.commands.values()).map(command => command.builder?.toJSON());

        if (guildId) return await rest.put(Routes.applicationGuildCommands(this.user?.id
            ?? process.env.CLIENT_ID
            ?? '', guildId), { body: commands });
        else return await rest.put(Routes.applicationCommands(this.user?.id
            ?? process.env.CLIENT_ID
            ?? ''), { body: commands });
    }

    addEvent(name: string, data: Event) {
        this[data.once ? 'once' : 'on'](name, (...args) => data.execute(this, ...args));
    }

    addEventsFolder(path: string) {
        path = join(this.caller, path);

        const files = readdirSync(path).filter(file => file.endsWith('.js'));
        for (const file of files) {
            const event = require(join(path, file));
            this.addEvent(file.split('.')[0], event);
        }
    }

    start(token?: string) {
        this.once('ready', () => console.log(`Ready! Logged in as ${this.user?.tag}`));
        this.on('error', console.error);

        if (this.hasModals) this.registerModals();

        return this.login(token
            ?? this.token
            ?? process.env.DISCORD_TOKEN
            ?? process.env.TOKEN
            ?? '');
    }
}

export * from 'discord.js';
export { Client };
export default Client;