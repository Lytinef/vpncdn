import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SosDevice } from './entities/sos-device.entity';
import { SosService } from './sos.service';
import { SosController } from './sos.controller';
import { NodesModule } from '../nodes/nodes.module';
import { XrayModule } from '../xray/xray.module';

@Module({
  imports: [TypeOrmModule.forFeature([SosDevice]), NodesModule, XrayModule],
  controllers: [SosController],
  providers: [SosService],
  exports: [SosService],
})
export class SosModule {}
