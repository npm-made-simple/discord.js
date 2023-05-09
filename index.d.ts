import {
    ChatInputCommandInteraction,
    Collection,
    Client as DiscordClient,
    GatewayIntentBits,
    ModalSubmitInteraction,
    SlashCommandAttachmentOption,
    SlashCommandBooleanOption,
    SlashCommandBuilder,
    SlashCommandChannelOption,
    SlashCommandIntegerOption,
    SlashCommandMentionableOption,
    SlashCommandNumberOption,
    SlashCommandRoleOption,
    SlashCommandStringOption,
    SlashCommandSubcommandBuilder,
    SlashCommandUserOption
} from "discord.js";

export * from "discord.js";
export class Client extends DiscordClient<boolean> {
    readonly db?: any;
    readonly commands: Collection<string, Command>;
    readonly modals: Collection<string, Modal>;
    constructor(intents: (keyof typeof GatewayIntentBits)[]);

    addModal(name: string, data: Modal): void;
    addModalsFolder(path: string): void;
    addCommand(name: string, data: Command | SubcommandCommand): void;
    addCommandsFolder(path: string): void;
    registerCommands(guildId?: string): Promise<unknown>;
    addEvent(name: string, data: Event): void;
    addEventsFolder(path: string): void;
    start(token?: string): Promise<string>;
}

export default Client;

export type SlashCommandOptions =
    | SlashCommandAttachmentOption
    | SlashCommandBooleanOption
    | SlashCommandChannelOption
    | SlashCommandIntegerOption
    | SlashCommandMentionableOption
    | SlashCommandNumberOption
    | SlashCommandRoleOption
    | SlashCommandStringOption
    | SlashCommandUserOption;

export interface Argument {
    name: string;
    type: "attachment" | "boolean" | "channel" | "integer" | "mentionable" | "number" | "role" | "string" | "user";
    description: string;
    required?: boolean;
    [key: string]: any;
}

export interface Command {
    name?: string;
    description: string;
    args?: Argument[];
    allowedInDMs?: boolean;
    permissionsRequired?: number;
    required?: boolean;
    builder?: SlashCommandBuilder,
    execute: (client: Client, interaction: ChatInputCommandInteraction) => any;
}

export interface Subcommand {
    name?: string;
    description: string;
    builder: SlashCommandSubcommandBuilder;
    execute: (client: Client, interaction: ChatInputCommandInteraction) => any;
}

export interface SubcommandCommand {
    name?: string;
    builder: SlashCommandBuilder;
    subcommands: Collection<string, Subcommand>;
}

export interface Modal {
    name?: string;
    execute: (client: Client, interaction: ModalSubmitInteraction, ...data: any[]) => any;
}

export interface Event {
    name?: string;
    once?: boolean;
    execute: (client: Client, ...args: any[]) => any;
}
