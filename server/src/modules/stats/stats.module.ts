import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Node } from '../nodes/entities/node.entity';
import { Device } from '../devices/entities/device.entity';
import { NodesModule } from '../nodes/nodes.module';
import { XrayModule } from '../xray/xray.module';
import { StatsPollerService } from './stats-poller.service';
import { AlertsService } from './alerts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Node, Device]), NodesModule, XrayModule],
  providers: [StatsPollerService, AlertsService],
})
export class StatsModule {}
