# Simple Discord.JS Framework

---

Makes it extremely easy to create and get a bot up and running with [Discord.JS](https://discord.js.org/#/). This framework is designed to get a bot up and running as quickly as possible with minimal effort.

## Installation

```bash
npm install simple-djs-framework
```

## Example Usage

```js
const { Client, SlashCommandBuilder } = require("simple-djs-framework")
const client = new Client([ "Guilds" ])

client.addCommand("ping", {
    description: "Pings the bot.",
    execute: (client, interaction) => {
        interaction.reply("Pong!")
    }
})

client.addEvent("ready", () => console.log("Ready!"))

client.registerCommands() // registers the commands globally
client.start("token")
```

## Examples

### Adding a command

```js
client.addCommand("ping", {
    description: "Pings the bot.",
    execute: (client, interaction) => {
        interaction.reply("Pong!")
    }
})

// commands also support adding more fields

client.addCommand("userjoined", {
    description: "Tells you when a user joined.",
    allowedInDMs: false,
    args: [{
        name: "user",
        type: "user",
        description: "The user to check.",
        required: true
    }],
    execute: (client, interaction) => {
        const user = interaction.options.getUser("user")
        interaction.reply(`${user.username} joined on ${user.createdAt}`)
    }
})
```

### Registering a command

```js
client.registerCommands() // registers the commands globally
client.registerCommands("guildID") // registers the commands in a guild
```

### Adding an event

```js
client.addEvent("ready", (client) => console.log("Ready!"))
```

### Using folders instead of a single file

```js
client.addCommandsFolder("./commands")
client.addEventsFolder("./events")
client.addModalsFolder("./modals")
```

#### Creating a command file

```js
// commands/ping.js

const { SlashCommandBuilder } = require("simple-djs-framework")

export const builder = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Pings the bot.")

export const execute = (client, interaction) => {
    interaction.reply("Pong!")
}
```

### Creating an event file

```js
// events/ready.js

export const execute = (client) => console.log("Ready!")
```

### Using `dotenv`

```js
require("dotenv").config()
client.start() // token will be read from .env as DISCORD_TOKEN or TOKEN
```

---

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
[Repository](https://github.com/alexasterisk/simple-djs-framework)

## Contributors

[@alexasterisk](https://github.com/alexasterisk)