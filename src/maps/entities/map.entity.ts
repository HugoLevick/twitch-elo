import {
  Column,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Game } from '../../games/entities/game.entity';

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

  @DeleteDateColumn({
    select: false,
  })
  deletedAt: Date;
}
