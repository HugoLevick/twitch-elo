import {
  Column,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Game } from '../../games/entities/game.entity';
import { Match } from '../../matches/entities/match.entity';

@Entity()
export class GameMap {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column('text', {
    nullable: false,
  })
  name: string;

  @ManyToOne(() => Game, (game) => game.maps, {
    eager: true,
  })
  game: Game;

  @OneToMany(() => Match, (match) => match.map, {
    nullable: true,
  })
  matches: Match[];

  @DeleteDateColumn({
    select: false,
  })
  deletedAt: Date;
}
