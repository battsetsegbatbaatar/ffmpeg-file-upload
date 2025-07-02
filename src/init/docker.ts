import { dockerRunRedis } from './docker/redis';
import { dockerIsInstalled } from '../../utils';

const flag = dockerIsInstalled();

if (flag) {
  console.log('✅ Docker суулгасан байна');
  dockerRunRedis(true);
} else {
  console.error('❌ Docker суулгаагүй байна!');
}
