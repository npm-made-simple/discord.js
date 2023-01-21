"use strict"
"shut up eslint and your stupid rules about using 'use strict'"
const Discord = require("discord.js")
const { dirname, join } = require("node:path")
const { readdirSync } = require("node:fs")
const callsite = require("callsite")

for (const key in Discord) {
    exports[key] = Discord[key]
}

class Client extends Discord.Client {
    _commands = new Map()
    _modals = new Map()
    #caller = dirname(callsite()[2].getFileName()) ?? ""
    #hasModals = false

    constructor(intents) {
        super({intents: intents})
    }

    get commands() { return this._commands }

    addModal(name, data) {
        this.#hasModals = true
        this._modals.set(name, data)
    }

    addModalsFolder(path) {
        path = join(this.#caller, path)
        const files = readdirSync(path).filter(file => file.match(/\.js$/))
        for (const file of files) {
            const modal = require(join(path, file))
            this.addModal(file.split(".")[0], modal)
        }
    }

    #registerModals() {
        this.on("interactionCreate", async (interaction) => {
            if (!interaction.isModalSubmit()) return
            const data = interaction.customId.split("|")
            const modal = this._modals.get(data[0])
            if (!modal) return

            try { await modal.execute(this, interaction, ...data.slice(1)) }
            catch (err) {
                console.error(err)
                await interaction.reply({
                    content: "There was an error while receiving this modal!",
                    ephemeral: true
                })
            }
        })
    }

    addCommand(name, data) {
        this._commands.set(name, data)
    }

    addCommandsFolder(path) {
        path = join(this.#caller, path)
        const files = readdirSync(path)
        for (const file of files) {
            if (file.match(/\.js$/)) {
                const command = require(join(path, file))
                this.addCommand(file.split(".")[0], command)
            } else if (!file.match(/\./)) {
                const subpath = join(path, file)
                const subfiles = readdirSync(subpath).filter(file => file.match(/\.js$/))
                const command = require(join(subpath, "index.js"))
                const subcommands = new Map()
                for (const subfile of subfiles) {
                    if (subfile === "index.js") continue;
                    const subcommand = require(join(subpath, subfile))
                    subcommands.set(subfile.split(".")[0], subcommand)
                    command.builder.addSubcommand(subcommand.builder)
                }
                command.subcommands = subcommands
                command.execute = async (client, interaction) => {
                    const subcommand = interaction.options.getSubcommand()
                    if (!subcommand) return await interaction.reply({
                        content: "You must provide a subcommand!",
                        ephemeral: true
                    })
                    const subcommandData = subcommands.get(subcommand)
                    if (!subcommandData) return await interaction.reply({
                        content: "That subcommand does not exist!",
                        ephemeral: true
                    })
                    try { await subcommandData.execute(client, interaction) }
                    catch (err) {
                        console.error(err)
                        await interaction.reply({
                            content: "There was an error while executing this command!",
                            ephemeral: true
                        })
                    }
                }
                this.addCommand(file, command)
            }
        }
    }

    async registerCommands(guildId) {
        this.on("interactionCreate", async (interaction) => {
            if (!interaction.isCommand()) return
            const command = this._commands.get(interaction.commandName)
            if (!command) return
            try { await command.execute(this, interaction) }
            catch (err) {
                console.error(err)
                try {
                    await interaction.reply({
                        content: `There was an error while executing this command!\n\`\`\`${err}\`\`\``,
                        ephemeral: true
                    })
                } catch (_) {
                    await interaction.followUp({
                        content: `There was an error while executing this command!\n\`\`\`${err}\`\`\``
                    })
                }
            }
        })

        const rest = new Discord.REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN
            ?? process.env.TOKEN
            ?? this.token
            ?? "")
        const commands = Array.from(this._commands.values()).map(command => command.builder.toJSON());
        if (guildId) return await rest.put(Discord.Routes.applicationGuildCommands(this.user?.id
            ?? process.env.CLIENT_ID
            ?? "", guildId), { body: commands })
        else return await rest.put(Discord.Routes.applicationCommands(this.user?.id
            ?? process.env.CLIENT_ID
            ?? ""), { body: commands })
    }

    addEvent(name, data) {
        this[data.once ? "once" : "on"](name, (...args) => data.execute(this, ...args))
    }

    addEventsFolder(path) {
        path = join(this.#caller, path)
        const files = readdirSync(path).filter(file => file.match(/\.js$/))
        for (const file of files) {
            const event = require(join(path, file))
            this.addEvent(file.split(".")[0], event)
        }
    }

    start(token) {
        this.once("ready", () => console.log("Ready! Logged in as " + this.user?.tag))
        this.on("error", console.error)

        if (this.#hasModals) this.#registerModals()

        return this.login(token
            ?? this.token
            ?? process.env.DISCORD_TOKEN
            ?? process.env.TOKEN
            ?? "")
    }
}

exports.Client = Client
exports.default = exports.Client