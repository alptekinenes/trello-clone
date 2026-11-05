import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Query of GET /files/:attachmentId. */
export class FileQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;

  /** `?download=true` forces a download, also for images. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  download?: boolean;
}
