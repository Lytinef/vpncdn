import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DevicePlatform } from '../entities/device.entity';

export class RegisterDeviceDto {
  @IsString()
  @MaxLength(128)
  name: string;

  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  /** Стабильный идентификатор устройства для повторного входа. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  hardwareId?: string;
}
