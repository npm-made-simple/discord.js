import {
    ChatInputCommandInteraction,
    Client as DiscordClient,
    GatewayIntentBits,
    ModalSubmitInteraction,
    SlashCommandBuilder,
    SlashCommandSubcommandBuilder
} from "discord.js";

export * from "discord.js";
export class Client extends DiscordClient<boolean> {
    constructor(intents: (keyof typeof GatewayIntentBits)[]);
    public addModal(name: string, data: Modal): void;
    public addModalsFolder(path: string): void;
    public addCommand(name: string, data: Command | SubcommandCommand): void;
    public addCommandsFolder(path: string): void;
    public registerCommands(guildId?: string): Promise<unknown>;
    public addEvent(name: string, data: Event): void;
    public addEventsFolder(path: string): void;
    public start(token?: string): Promise<string>;
    get commands(): Map<string, Command | SubcommandCommand>;
}
export default Client;

export interface Command {
    name?: string;
    description: string;
    builder: SlashCommandBuilder,
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
    subcommands: Subcommand[];
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