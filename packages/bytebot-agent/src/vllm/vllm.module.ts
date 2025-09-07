import { Module } from '@nestjs/common';
import { VllmService } from './vllm.service';

@Module({
  providers: [VllmService],
  exports: [VllmService],
})
export class VllmModule {}
