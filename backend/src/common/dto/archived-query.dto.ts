import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/** `?archived=true` lists the archive instead of the active items. */
export class ArchivedQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  archived?: boolean;
}
