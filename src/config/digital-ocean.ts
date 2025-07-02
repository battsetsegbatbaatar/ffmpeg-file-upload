import { S3Client } from '@aws-sdk/client-s3';
import config from '.';

const { SPACE_ACCESS_KEY, SPACE_ENDPOINT, SPACE_SECRET_KEY, SPACE_REGION } =
  config;

export const s3Client: S3Client = new S3Client({
  region: SPACE_REGION,
  endpoint: SPACE_ENDPOINT,
  credentials: {
    accessKeyId: SPACE_ACCESS_KEY as string,
    secretAccessKey: SPACE_SECRET_KEY as string
  }
});
