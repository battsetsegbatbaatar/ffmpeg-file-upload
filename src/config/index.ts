import 'dotenv/config';

export default {
  PORT: process.env.PORT || 3001,
  DATABASE_URL: process.env.DATABASE_URL || '',

  SPACE_BUCKET_NAME: process.env.SPACE_BUCKET_NAME || '',
  SPACE_ENDPOINT: process.env.SPACE_ENDPOINT || '',
  SPACE_REGION: process.env.SPACE_REGION || '',
  SPACE_ACCESS_KEY: process.env.SPACE_ACCESS_KEY || '',
  SPACE_SECRET_KEY: process.env.SPACE_SECRET_KEY || '',

  JWT_SECRET: process.env.JWT_SECRET || ''
};
