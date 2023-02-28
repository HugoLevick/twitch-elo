import {
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  ManyToOne,
  DeleteDateColumn,
  CreateDateColumn,
  Column,
} from 'typeorm';
import { Player } from '../../players/entities/player.entity';
import { Game } from '../../games/entities/game.entity';

export enum MatchStatuses {
  queueing = 'QUEUEING',
  inProgress = 'IN_PROGRESS',
  canceled = 'CANCELED',
}

@Entity()
export class Match {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column('enum', {
    enum: MatchStatuses,
    default: MatchStatuses.queueing,
  })
  status: MatchStatuses;

  @ManyToMany(() => Player, {
    eager: true,
  })
  @JoinTable()
  players: Player[];

  @ManyToOne(() => Game, (game) => game.matches)
  game: Game;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
