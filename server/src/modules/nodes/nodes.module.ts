import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Node } from './entities/node.entity';
import { Device } from '../devices/entities/device.entity';
import { NodesService } from './nodes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Node, Device])],
  providers: [NodesService],
  exports: [NodesService],
})
export class NodesModule {}
