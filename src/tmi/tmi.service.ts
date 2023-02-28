import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import * as tmi from 'tmi.js';
import { PlayersService } from '../players/players.service';
import { Player } from '../players/entities/player.entity';

@Injectable()
export class TmiService {
  constructor(private readonly playersService: PlayersService) {}

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
        this.tmiClient.say(
          channel,
          `Your username is ` +
            (await (
              await this.addToMatch(tags.username)
            ).username),
        );
      }
    });
  }

  async addToMatch(username: string) {
    let player: Player;
    try {
      player = await this.playersService.findOne(username);
    } catch (error) {
      player = await this.playersService.create({ username });
    }

    return player;
  }
}
