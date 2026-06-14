import { IsNumber, IsOptional, IsString } from 'class-validator';

export class TelegramLoginDto {
  @IsNumber()
  id: number;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  @IsNumber()
  auth_date: number;

  @IsString()
  hash: string;

  /** Платформа клиента, с которого вход (для метки сессии). */
  @IsOptional()
  @IsString()
  platform?: string;
}
