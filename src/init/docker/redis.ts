import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

import { REDIS_CONFIG } from '../../config/redis';

export const dockerRunRedis = (init = true) => {
  if (!init) return;

  const { container, port, volume, image } = REDIS_CONFIG.docker;

  // Фолдерууд үүсгэх
  const dataDir = path.join(volume, 'data');
  const confDir = path.join(volume, 'conf');

  [dataDir, confDir].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  try {
    const existingContainer = execSync(
      `docker ps -a --filter "name=^/${container}$" --format "{{.Names}}"`
    )
      .toString()
      .trim();

    if (existingContainer === container) {
      execSync(`docker stop ${container}`, { stdio: 'inherit' });
      execSync(`docker rm ${container}`, { stdio: 'inherit' });
    }
  } catch {}

  try {
    const runCmd = `
      docker run -d \
      -p ${port}:6379 \
      --name ${container} \
      -v ${path.resolve(volume)}/data:/data \
      ${image} redis-server
    `;

    execSync(runCmd, { stdio: 'inherit' });

    console.log(`✅ Redis container started on port ${port}`);
  } catch (error: any) {
    console.error('❌ Redis контейнер эхлүүлэхэд алдаа:', error.message);
  }
};
