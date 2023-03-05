<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

# Twitch-Elo

## Description

Twitch-Elo is a twitch bot built with NestJS and PostgreSQL that can be used on a channel chat to host matches for every game where there are 2 teams and an even number of players in each team.

It ranks every player with the ELO algorithm depending on their losses and wins

## Installation

```bash
#development
$ npm install

#production (use this one if you're not developing it)
$ npm install --omit-dev
```

## Running the app

Before running the app, you need to make a copy of the `.env.template` file and rename it to `.env`. After that, open the file and fill in the environment variables. This is a quick rundown of their function:

### DB_HOST

Where the database is hosted. Examples: localhost, https://railway.com/database

- ### DB_PORT
  The port at which the database can be accessed.
- ### DB_NAME
  The name of the database where data will be stored
- ### DB_USERNAME
  The username of the user who has access to the database
- ### DB_PASSWORD
  The password of the user who has access to the database
- ### PORT
  Port where the application will be running

After filling in the variables, choose one of these commands to run (remember to run them in the root of the app)

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode (use this one if you're not developing it)
$ npm run start:prod
```

## Commands

This is a list of every command available. These can be used in the twitch chat that the bot is listening to

### ++

Adds the player who sent the message to the queue

### --

Removes the player who sent the message from the queue

### !queue

Shows the players waiting in queue

### !who

Shows the active matches

### !vote (number)

Vote for a map when the match is in vote phase

### !p (username)

(Only team captains). Picks a teammate from the list. Only available during pick phase.

### !subme

Lets the player who sent the message look for a substitute

### !subfor (username)

Lets the player who sent the message get in the team of the player looking for a substitue.

### !capme

Lets the player who sent the message look for someone to replace their role as a captain.

### !capfor (username)

Lets the player who sent the message get the captain role in a team.

## Stay in touch

- Author - [Hugo Levick](https://github.com/HugoLevick)
- Twitter - [@hlevickh](https://twitter.com/hlevickh)

## License

Nest is [MIT licensed](LICENSE).
