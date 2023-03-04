import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import * as tmi from 'tmi.js';
import { MatchesService } from '../matches/matches.service';
import { Match } from '../matches/entities/match.entity';
import { CommonService } from '../common/common.service';
import { PlayersService } from '../players/players.service';

@Injectable()
export class TmiService {
  constructor(
    private readonly playersService: PlayersService,

    @Inject(forwardRef(() => MatchesService))
    private readonly matchesService: MatchesService,

    @Inject(forwardRef(() => CommonService))
    private readonly commonService: CommonService,
  ) {}

  private tmiClient: tmi.Client;
  private logger = new Logger('TmiService');

  //Bot is started from setOptions() in commonModule
  async startBot(bottedChannel: string) {
    this.logger.log(`Starting bot on ${bottedChannel}...`);
    this.tmiClient = new tmi.Client({
      options: {
        //debug: true,
      },
      identity: {
        username: 'henzzito',
        password: 'oauth:c013cz4hbrzxjwdepbpvzphxl5nl9a',
      },
      channels: [bottedChannel],
    });
    this.addHandlers(this.tmiClient);
    await this.tmiClient.connect();
    this.logger.log('Bot listening to commands');
  }

  async stopBot() {
    this.logger.log('Disconnecting from Twitch...');
    await this.tmiClient.disconnect();
  }

  addHandlers(client: tmi.Client) {
    client.on('chat', async (channel, tags, message, self) => {
      if (self) return;
      if (message.startsWith('++')) {
        const { playersPerTeam } = this.commonService.options;
        const match = await this.addToQueue(tags.username);
        if (match && match.players.length !== playersPerTeam * 2) {
          this.say(
            channel,
            this.getMatchPlayersToString(match, playersPerTeam),
          );
        }
        return;
      }

      if (message.startsWith('--')) {
        const { playersPerTeam } = this.commonService.options;
        const match = await this.removeFromQueue(tags.username);
        if (match) {
          this.tmiClient.say(
            channel,
            this.getMatchPlayersToString(match, playersPerTeam),
          );
        }
        return;
      }

      if (message.startsWith('!')) {
        const params = message.split(' ');
        const command = params.shift().toLowerCase();
        const { bottedChannel, playersPerTeam } = this.commonService.options;
        switch (command) {
          case '!who':
            const currentMatches =
              await this.matchesService.getCurrentMatches();
            if (currentMatches.length === 0) {
              await this.say(bottedChannel, '-- No matches --');
              return;
            }
            for (const match of currentMatches) {
              await this.say(
                bottedChannel,
                this.getMatchPlayersToString(match, playersPerTeam),
              );
            }
            break;

          case '!queue':
            const match = await this.matchesService.findLatest();
            if (!match) {
              await this.say(bottedChannel, '-- No queues --');
              return;
            }
            await this.say(
              bottedChannel,
              this.getMatchPlayersToString(match, playersPerTeam),
            );
            break;

          case '!vote':
            const mapVoteNumber = parseInt(params[0]);
            if (isNaN(mapVoteNumber)) return;

            try {
              const didVote = await this.matchesService.vote(
                tags.username,
                mapVoteNumber,
              );

              if (didVote) {
                if (mapVoteNumber <= 3) {
                  await this.say(
                    bottedChannel,
                    `${tags.username} voted for map ${mapVoteNumber}`,
                  );
                } else {
                  await this.say(
                    bottedChannel,
                    `${tags.username} omitted voting`,
                  );
                }
              }
            } catch (error) {
              this.logger.error(error.message);
            }
            break;

          case '!p':
            const pickedUsername = this.formatUsername(params[0]);
            if (!pickedUsername) return;
            try {
              await this.matchesService.pick(tags.username, pickedUsername);
            } catch (error) {
              this.logger.error(error.message);
            }
            break;

          case '!rl':
            if (params[0] && this.hasPrivilege(tags)) {
              await this.matchesService.reportLose(
                this.formatUsername(params[0]),
              );
            } else {
              await this.matchesService.reportLose(tags.username);
            }

          case '!cancelmatch':
            if (this.hasPrivilege(tags)) {
              const matchId = parseInt(params[0]);
              if (isNaN(matchId)) return;
              const canceled = await this.matchesService.cancelMatch(
                matchId,
                'Request to cancel by mod/broadcaster',
              );

              if (!canceled)
                await this.say(
                  channel,
                  `@${tags.username} Match #${matchId} not found or already canceled`,
                );
            }
            break;

          case '!elopoints':
            try {
              const points = await this.playersService.getElo(tags.username);
              await this.say(channel, `@${tags.username}: ${points} points`);
            } catch (error) {
              this.logger.error(error.message);
            }
            break;

          case '!subme':
            await this.matchesService.subMe(tags.username);
            break;

          case '!subfor':
            try {
              await this.matchesService.subFor(
                tags.username,
                this.formatUsername(params[0]),
              );
            } catch (error) {
              this.logger.error(error.message);
              return;
            }
            break;

          case '!capme':
            try {
              await this.matchesService.capMe(tags.username);
            } catch (error) {
              this.logger.error(error.message);
              return;
            }
            break;

          case '!capfor':
            try {
              await this.matchesService.capFor(
                tags.username,
                this.formatUsername(params[0]),
              );
            } catch (error) {
              this.logger.error(error.message);
              return;
            }
            break;
        }
      }
    });
  }

  async say(channel: string, message: string) {
    await this.tmiClient.say(channel, message);
    return;
  }

  getMatchPlayersToString(match: Match, playersPerTeam: number) {
    if (match.players.length === 0)
      return `#${match.id} 0/${playersPerTeam * 2} - No one in queue`;
    let playerNamesArray: string[] = [];
    for (const player of match.players) {
      playerNamesArray.push(player.username);
    }
    //prettier-ignore
    return `#${match.id} ${match.players.length}/${playersPerTeam*2} (${playerNamesArray.join(' / ')})`;
  }

  async addToQueue(username: string) {
    try {
      const match = await this.matchesService.addPlayerToQueue(username);
      return match;
    } catch (error) {
      this.logger.warn(error.message);
      return;
    }
  }

  async removeFromQueue(username: string) {
    try {
      const match = await this.matchesService.removePlayerFromQueue(username);
      return match;
    } catch (error) {
      this.logger.warn(error.message);
      return;
    }
  }

  private hasPrivilege(tags) {
    return tags.mod || tags.badges.broadcaster;
  }

  private formatUsername(string: string) {
    return string.replace('@', '').toLowerCase();
  }
}
