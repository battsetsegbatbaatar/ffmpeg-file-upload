import { neon } from '@neondatabase/serverless';
import config from '.';

const { DATABASE_URL } = config;

export const NeonDB = neon(DATABASE_URL);
