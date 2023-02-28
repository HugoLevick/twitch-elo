import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import * as tmi from 'tmi.js';
import { MatchesService } from '../matches/matches.service';
import { Match } from '../matches/entities/match.entity';

@Injectable()
export class TmiService {
  constructor(
    @Inject(forwardRef(() => MatchesService))
    private readonly matchesService: MatchesService,
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
        const { match, playersPerTeam } = await this.addToQueue(tags.username);
        if (match) {
          this.tmiClient.say(
            channel,
            this.getMatchPlayersToString(match, playersPerTeam),
          );
        }
        return;
      }

      if (message.startsWith('--')) {
        const { match, playersPerTeam } = await this.removeFromQueue(
          tags.username,
        );
        if (match) {
          this.tmiClient.say(
            channel,
            this.getMatchPlayersToString(match, playersPerTeam),
          );
        }
        return;
      }
    });
  }

  getMatchPlayersToString(match: Match, playersPerTeam: number) {
    if (match.players.length === 0)
      return `0/${playersPerTeam * 2} - No one in queue`;
    let playerNamesArray: string[] = [];
    for (const player of match.players) {
      playerNamesArray.push(player.username);
    }
    //prettier-ignore
    return `${match.players.length}/${playersPerTeam*2} (${playerNamesArray.join(' / ')})`;
  }

  async addToQueue(username: string) {
    try {
      const data = await this.matchesService.addPlayerToQueue(username);
      return data;
    } catch (error) {
      this.logger.warn(username + ' is already in a queue or match');
      return { match: undefined, playersPerTeam: undefined };
    }
  }

  async removeFromQueue(username: string) {
    try {
      const data = await this.matchesService.removePlayerFromQueue(username);
      return data;
    } catch (error) {
      console.log(error);
      this.logger.warn(username + ' was not in the queue');
      return { match: undefined, playersPerTeam: undefined };
    }
  }
}
