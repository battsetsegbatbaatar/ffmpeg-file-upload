import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { spawn } from 'child_process';

import { putObject, removeObject } from './initFile';
import { NeonDB } from '../config/database';

import config from '../config';

const { SPACE_BUCKET_NAME } = config;

export enum FILE_STATUS {
  FINISHED = 'finished',
  FAILED = 'failed',
  PROCESSING = 'processing'
}

export const runFfmpegProcess = async (
  id: string,
  key: string,
  sourceUrl: string
): Promise<any> => {
  const outputDir = path.join(__dirname, `../../../convertVideos/${key}`);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log('🎬 FFmpeg хөрвүүлэлт эхэллээ:', { id, key, sourceUrl });

  try {
    const resolutions = [1080, 720, 480, 360];
    const uploadedUrls: Record<string, string> = {};

    const duration = await getDuration(sourceUrl);
    console.log('⏱ Видео үргэлжлэх хугацаа (сек):', duration);

    await Promise.all(
      resolutions.map(async (res) => {
        const dir = path.join(outputDir, res.toString());
        fs.mkdirSync(dir, { recursive: true });

        await streamToHLS(dir, sourceUrl, res);
        const files = fs.readdirSync(dir);
        console.log(`📂 ${res}p файлууд:`, files);

        for await (const file of files) {
          const filePath = path.join(dir, file);
          await putObject({
            key: `${key}/${res}/${file}`,
            file: fs.readFileSync(filePath),
            acl: 'public-read',
            meta: {}
          });
        }

        const endpoint = `https://${SPACE_BUCKET_NAME}.sgp1.cdn.digitaloceanspaces.com`;
        const m3u8Url = `${endpoint}/${key}/${res}/main.m3u8`;
        uploadedUrls[`p${res}`] = m3u8Url;
      })
    );

    fs.rmSync(outputDir, { recursive: true, force: true });
    await removeObject(key);

    console.log('📤 Upload амжилттай. HLS URL-ууд:', uploadedUrls);

    if (!uploadedUrls.p720) {
      throw new Error('p720 URL үүсээгүй тул update хийх боломжгүй.');
    }

    const updateQuery = `
      UPDATE "Files" SET
        status = '${FILE_STATUS.FINISHED}',
        p1080 = '${uploadedUrls.p1080 || ''}',
        p720 = '${uploadedUrls.p720 || ''}',
        p480 = '${uploadedUrls.p480 || ''}',
        p360 = '${uploadedUrls.p360 || ''}',
        url = '${uploadedUrls.p720}',
        duration = ${duration}
      WHERE id = '${id}'
    `;
    await NeonDB.query(updateQuery);
    console.log(`✅ DB шинэчлэлт амжилттай: ${id}`);
    return;
  } catch (err: any) {
    console.error(`❌ FFmpeg процесс алдаа:`, err);
    console.log('error id:', id);
    await NeonDB.query(`
      UPDATE "Files" SET status = ${FILE_STATUS.FAILED} WHERE id = ${id}
    `);

    throw new Error(`FFmpeg процесс амжилтгүй боллоо: ${err.message}`);
  }
};

const streamToHLS = (
  outputPath: string,
  inputUrl: string,
  resolution: number
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const videoBitrate = {
      1080: '3000k',
      720: '1800k',
      480: '1000k',
      360: '600k'
    }[resolution];

    const scale = {
      1080: '1920:1080',
      720: '1280:720',
      480: '854:480',
      360: '640:360'
    }[resolution];

    const args: any = [
      '-fflags',
      '+genpts',
      '-i',
      inputUrl,
      '-preset',
      'ultrafast',
      '-threads',
      '8',
      '-g',
      '48',
      '-sc_threshold',
      '0',
      '-vf',
      `scale=${scale}`,
      '-c:v',
      'libx264',
      '-b:v',
      videoBitrate,
      '-hls_time',
      '5',
      '-hls_list_size',
      '0',
      '-hls_segment_filename',
      `${outputPath}/main_%03d.ts`,
      `${outputPath}/main.m3u8`
    ];

    const ffmpegProcess = spawn('ffmpeg', args);

    ffmpegProcess.on('exit', (code, signal) => {
      if (code === 0) {
        console.log(`🎉 ${resolution}p хөрвүүлэлт дууслаа`);
        resolve(true);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpegProcess.on('error', (err) => {
      console.error(`[${resolution}] FFmpeg алдаа:`, err);
      reject(err);
    });

    ffmpegProcess.stderr.on('data', (data) => {
      console.error(`[${resolution}] stderr: ${data}`);
    });

    ffmpegProcess.stdout.on('data', (data) => {
      console.log(`[${resolution}] stdout: ${data}`);
    });
  });
};

export const getDuration = async (url: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    ffmpeg(url).ffprobe((err: any, metadata: any) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      if (duration) return resolve(duration);
      reject(new Error('⛔ Видео үргэлжлэх хугацаа олдсонгүй'));
    });
  });
};

export const getFileInfo = async (url: string): Promise<object> => {
  return new Promise((resolve, reject) => {
    ffmpeg(url).ffprobe((err: any, metadata: object | PromiseLike<object>) => {
      if (err) return reject(err);
      resolve(metadata);
    });
  });
};

export default {
  runFfmpegProcess,
  getDuration,
  getFileInfo
};
