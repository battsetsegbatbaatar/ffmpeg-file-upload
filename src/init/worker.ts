import { Worker } from 'bullmq';
import fs from 'fs';
import { v4 as uuidV4 } from 'uuid';

import {
  completeMultipart,
  getObjectSignedUrl,
  initialUpload,
  listParts,
  uploadPart
} from './initFile';
import initFFmpeg from './initFFmpeg';

import { NeonDB } from '../config/database';
import { REDIS_CONFIG } from '../config/redis';

export const worker = new Worker(
  'video-convert',
  async (job) => {
    const { file, userId, filename } = job.data;
    const CHUNK_SIZE = 10 * 1024 * 1024;
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

    let uploadId = '';
    let key = '';
    const id = uuidV4();

    // 📦 Multipart Upload эхлүүлэх
    const result: any = await initialUpload({
      id,
      name: filename.toString().replace(/\.[^/.]+$/, ''),
      totalChunk: totalChunks,
      key: `testUpload/${id}`,
      acl: 'public-read',
      userId,
      duration: 0,
      size: file.size,
      Metadata: { 'x-amz-meta-user': userId }
    }).catch((err) => {
      console.error('❌ initialUpload алдаа:', err);
      throw err;
    });

    if (!result?.Key || !result?.UploadId) {
      throw new Error('❌ initialUpload-оос key эсвэл uploadId хоосон байна');
    }

    key = result.Key;
    uploadId = result.UploadId;
    console.log('📁 Multipart upload эхэллээ:', { key, uploadId });

    const uploadPromises = [];
    const buffer = fs.readFileSync(file.path);

    for (let index = 0; index < totalChunks; index++) {
      const start = index * CHUNK_SIZE;
      const end = start + CHUNK_SIZE;
      const chunk = buffer.subarray(start, end);

      // ✅ uploadPart-д орох бүх параметр шалгасан
      if (!key || !uploadId) {
        throw new Error('❌ uploadPart-д key эсвэл uploadId дутуу байна');
      }

      const part = await uploadPart({
        file: chunk,
        index: index + 1,
        key,
        uploadId
      });

      uploadPromises.push(part);
    }

    await Promise.all(uploadPromises);
    console.log('✅ Бүх хэсгийг амжилттай upload хийлээ');

    const parts = await listParts(key, uploadId).then(
      (result) =>
        result.Parts?.map((part) => ({
          ETag: part.ETag,
          PartNumber: part.PartNumber
        })) || []
    );

    await completeMultipart({
      key: key.toString(),
      uploadId: uploadId.toString(),
      parts
    });

    console.log('✅ Multipart upload дууслаа');

    const signedUrl = await getObjectSignedUrl(key.toString());

    // 🎬 FFmpeg хөрвүүлэлт эхлүүлэх
    await initFFmpeg.runFfmpegProcess(id, key, signedUrl);

    const [data] = await NeonDB.query(
      `SELECT * FROM "Files" WHERE id = '${id}'`
    );

    console.log('DB-с ирсэн үр дүн:', data);

    return {
      success: true,
      message: 'Амжилттай хөрвүүллээ',
      data
    };
  },
  {
    concurrency: 3,
    connection: {
      host: REDIS_CONFIG.docker.host,
      port: REDIS_CONFIG.docker.port
    },
    lockDuration: 600000,
    stalledInterval: 60000,
    removeOnComplete: {
      age: 3600, // ⏳ 1 цагийн дараа устгах
      count: 100 // 🧹 хамгийн сүүлчийн 100 job үлдээх
    },
    removeOnFail: {
      age: 86400, // ⏳ 1 өдөр хадгалах
      count: 10 // 🔥 хамгийн сүүлчийн 10 fail-тай job хадгалах
    }
  }
);
