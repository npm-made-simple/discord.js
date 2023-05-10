/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-function */

import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    SlashCommandSubcommandBuilder
} from 'discord.js';

type ExecuteFunction = (
    client: any,
    interaction: ChatInputCommandInteraction
) => unknown;

export interface CommandOptions {
    allowedInDMs?: boolean;
    permissionsRequired?: string;
}

/**
 * A command builder for the Client.
 * @param name The name of the command.
 * @param options The command options. Optional.
 * @example
 * const command = new Command('ping')
 *     .setDescription('Replies with pong.')
 *     .setExecutor(async (client, interaction) => {
 *         await interaction.reply('Pong!');
 *     });
 * @extends SlashCommandBuilder
 */
export class Command extends SlashCommandBuilder {
    execute: ExecuteFunction = () => {};

    constructor(readonly name: string, options?: CommandOptions) {
        super();
        super.setName(name);

        if (options?.allowedInDMs !== undefined)
            super.setDMPermission(options.allowedInDMs);
        if (options?.permissionsRequired !== undefined)
            super.setDefaultMemberPermissions(options.permissionsRequired);
    }

    /**
     * Sets the executor for the command.
     * This is the function that will be called when the command is used.
     * @param execute The executor function.
     * @example
     * const command = new Command('ping')
     *     .setDescription('Replies with pong.')
     *     .setExecutor(async (client, interaction) => {
     *         await interaction.reply('Pong!');
     *     });
     */
    setExecutor(execute: ExecuteFunction): Command {
        this.execute = execute;
        return this;
    }
}

/**
 * A subcommand builder for the Client.
 * @param name The name of the subcommand.
 * @example
 * const subcommand = new Subcommand('ping')
 *     .setDescription('Replies with pong.')
 *     .setExecutor(async (client, interaction) => {
 *         await interaction.reply('Pong!');
 *     });
 * // Add the subcommand to a SubcommandGroup.
 * const subcommandGroup = new SubcommandGroup('example')
 *     .addSubcommand(subcommand);
 * @extends SlashCommandSubcommandBuilder
 */
export class Subcommand extends SlashCommandSubcommandBuilder {
    execute: ExecuteFunction = () => {};

    constructor(readonly name: string) {
        super();
        super.setName(name);
    }

    /**
     * Sets the executor for the subcommand.
     * This is the function that will be called when the subcommand is used.
     * @param execute The executor function.
     * @example
     * const subcommand = new Subcommand('ping')
     *     .setDescription('Replies with pong.')
     *     .setExecutor(async (client, interaction) => {
     *         await interaction.reply('Pong!');
     *     });
     */
    setExecutor(execute: ExecuteFunction): Subcommand {
        this.execute = execute;
        return this;
    }
}

/**
 * A subcommand group builder for the Client.
 * @param name The name of the subcommand group.
 * @param options The command options. Optional.
 * @example
 * const subcommand = new Subcommand('ping')
 *     .setDescription('Replies with pong.')
 *     .setExecutor(async (client, interaction) => {
 *         await interaction.reply('Pong!');
 *     });
 * // Add the subcommand to a SubcommandGroup.
 * const subcommandGroup = new SubcommandGroup('example')
 *     .addSubcommand(subcommand);
 * @extends Command
 */
export class SubcommandGroup extends Command {
    subcommands: Subcommand[] = [];

    constructor(readonly name: string, options?: CommandOptions) {
        super(name, options);

        super.setExecutor(async (client, interaction) => {
            const subcommand = interaction.options.getSubcommand();
            const data = this.subcommands.find((sc) => sc.name === subcommand);

            if (!data) {
                await interaction.reply({
                    content: 'An error occurred while executing this command.',
                    ephemeral: true
                });

                return;
            }

            await data.execute(client, interaction);
        });
    }

    /**
     * Adds a subcommand to the subcommand group.
     * @param subcommand The subcommand to add.
     * @example
     * const subcommand = new Subcommand('ping')
     *     .setDescription('Replies with pong.')
     *     .setExecutor(async (client, interaction) => {
     *         await interaction.reply('Pong!');
     *     });
     * // Add the subcommand to a SubcommandGroup.
     * const subcommandGroup = new SubcommandGroup('example')
     *     .addSubcommand(subcommand);
     */
    addSubcommand(subcommand: Subcommand): SubcommandGroup {
        this.subcommands.push(subcommand);
        super.addSubcommand(subcommand);
        return this;
    }
}
