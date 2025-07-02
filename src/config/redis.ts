export const REDIS_CONFIG = {
  docker: {
    container: 'redis-dev',
    host: 'localhost',
    port: 6379,
    volume: '/path/to/redis',
    image: 'redis:7.2-alpine'
  }
};
