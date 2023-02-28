import { GameMap } from 'src/maps/entities/map.entity';
import { Match } from '../../matches/entities/match.entity';
import {
  Column,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Game {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column('text', {
    nullable: false,
  })
  name: string;

  @OneToMany(() => GameMap, (gameMap) => gameMap.game, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  maps: GameMap[];

  @DeleteDateColumn({
    select: false,
  })
  deletedAt: Date;
}
