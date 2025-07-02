import { Queue } from 'bullmq';
import { REDIS_CONFIG } from '../../config/redis';

export const videoQueue = new Queue('video-convert', {
  connection: {
    host: REDIS_CONFIG.docker.host,
    port: REDIS_CONFIG.docker.port
  }
});
