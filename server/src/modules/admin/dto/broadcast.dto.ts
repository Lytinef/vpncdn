import { IsString, MaxLength, MinLength } from 'class-validator';

export class AdminBroadcastDto {
  /** Текст рассылки (HTML-разметка Telegram допускается). */
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text: string;
}
