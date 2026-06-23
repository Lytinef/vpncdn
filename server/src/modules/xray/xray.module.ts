import { Module } from '@nestjs/common';
import { XrayService } from './xray.service';
import { XrayNodeClient } from './xray-node.client';
import { AwgClient } from './awg.client';
import { AwgService } from './awg.service';

@Module({
  providers: [XrayService, XrayNodeClient, AwgClient, AwgService],
  exports: [XrayService, AwgService],
})
export class XrayModule {}
