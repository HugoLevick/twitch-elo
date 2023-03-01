import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import * as tmi from 'tmi.js';
import { MatchesService } from '../matches/matches.service';
import { Match } from '../matches/entities/match.entity';
import { CommonService } from '../common/common.service';

@Injectable()
export class TmiService {
  constructor(
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
        const command = params.shift();
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
              await this.matchesService.vote(tags.username, mapVoteNumber);
            } catch (error) {
              this.logger.error(error.message);
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
}
