import {
  AbortMultipartUploadCommand,
  AbortMultipartUploadCommandInput,
  AbortMultipartUploadCommandOutput,
  CompleteMultipartUploadCommand,
  CompleteMultipartUploadCommandInput,
  CompleteMultipartUploadCommandOutput,
  CompletedPart,
  CreateMultipartUploadCommand,
  CreateMultipartUploadCommandInput,
  CreateMultipartUploadCommandOutput,
  DeleteObjectCommand,
  DeleteObjectCommandInput,
  DeleteObjectCommandOutput,
  GetObjectCommand,
  GetObjectCommandInput,
  ListPartsCommand,
  ListPartsCommandInput,
  ListPartsCommandOutput,
  ObjectCannedACL,
  PutObjectCommand,
  PutObjectCommandInput,
  PutObjectCommandOutput,
  UploadPartCommand,
  UploadPartCommandInput,
  UploadPartCommandOutput
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { s3Client } from '../config/digital-ocean';
import { NeonDB } from '../config/database';

import config from '../config';

const { SPACE_BUCKET_NAME } = config;

/**
 * Файлын төрлийг шалгах
 */
export const checkFile = async (buffer: Buffer): Promise<string> => {
  const allowed_types = ['mp4', 'mov', 'jpg', 'jpeg', 'png', 'gif'];

  const { fileTypeFromBuffer } = await (eval('import("file-type")') as Promise<
    typeof import('file-type')
  >);

  const file_type = await fileTypeFromBuffer(buffer);
  if (!file_type || !file_type.ext)
    throw new Error('Файлын өргөтгөл тодорхойгүй эсвэл дэмжигдэхгүй байна');

  if (!allowed_types.includes(file_type.ext))
    throw new Error('Файлын төрөл дэмжигдэхгүй байна');

  return file_type.ext;
};

/**
 * Multipart upload эхлүүлэх
 */
export const initialUpload = async ({
  id,
  name,
  key,
  acl,
  size,
  userId,
  duration,
  totalChunk,
  Metadata = {}
}: {
  id: string;
  name: string;
  key: string;
  size: number;
  userId: string;
  duration: number;
  totalChunk: number;
  acl: ObjectCannedACL;
  Metadata?: Record<string, string>;
}): Promise<CreateMultipartUploadCommandOutput> => {
  const params: CreateMultipartUploadCommandInput = {
    Bucket: SPACE_BUCKET_NAME,
    Key: key,
    ACL: acl,
    Metadata
  };

  try {
    await NeonDB.query(
      `
      INSERT INTO "Files" 
      (id, key, acl, mimetype, type, name, size, duration, status, "totalChunk", "createdAt", "updatedAt", "createdUserId") 
      VALUES 
      (
        '${id}',
        '${key}',
        '${acl}',
        'video/mp4',
        'video',
        '${name}',
        ${size},
        ${duration},
        'ongoing',
        ${totalChunk},
        current_timestamp,
        current_timestamp,
        '${userId}'
      )
    `
    ).catch((err) => {
      console.log('insert error');
      throw new Error(err.message);
    });

    const data = await s3Client.send(new CreateMultipartUploadCommand(params));
    return data;
  } catch (error) {
    console.error('⚠️ Multipart upload эхлүүлэхэд алдаа гарлаа:', error);
    throw error;
  }
};

/**
 * Multipart upload цуцлах
 */
export const abortMultipartUpload = async (
  key: string,
  uploadId: string
): Promise<AbortMultipartUploadCommandOutput> => {
  const params: AbortMultipartUploadCommandInput = {
    Bucket: SPACE_BUCKET_NAME,
    UploadId: uploadId,
    Key: key
  };

  try {
    return await s3Client.send(new AbortMultipartUploadCommand(params));
  } catch (error) {
    console.error('⚠️ Upload цуцлахад алдаа гарлаа:', error);
    throw error;
  }
};

/**
 * Multipart upload-д хэсэг файл нэмэх
 */
export const uploadPart = async ({
  file,
  key,
  uploadId,
  index
}: {
  file: Buffer;
  key: string;
  uploadId: string;
  index: number;
}): Promise<UploadPartCommandOutput> => {
  if (!file) throw new Error('Файл олдсонгүй');
  const params: UploadPartCommandInput = {
    Bucket: SPACE_BUCKET_NAME,
    Key: key,
    Body: file,
    PartNumber: index,
    UploadId: uploadId
  };

  try {
    return await s3Client.send(new UploadPartCommand(params));
  } catch (error) {
    console.error(`⚠️ Хэсэг ${index} upload хийхэд алдаа гарлаа:`, error);
    throw error;
  }
};

/**
 * Multipart upload-ийн хэсгүүдийг жагсаах
 */
export const listParts = async (
  key: string,
  uploadId: string
): Promise<ListPartsCommandOutput> => {
  const params: ListPartsCommandInput = {
    Bucket: SPACE_BUCKET_NAME,
    Key: key,
    UploadId: uploadId
  };

  try {
    return await s3Client.send(new ListPartsCommand(params));
  } catch (error) {
    console.error('⚠️ Upload хэсгүүдийг жагсаахад алдаа гарлаа:', error);
    throw error;
  }
};

/**
 * Multipart upload-г дуусгах
 */
export const completeMultipart = async ({
  key,
  uploadId,
  parts
}: {
  key: string;
  uploadId: string;
  parts: CompletedPart[];
}): Promise<CompleteMultipartUploadCommandOutput> => {
  const params: CompleteMultipartUploadCommandInput = {
    Bucket: SPACE_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts
    }
  };

  try {
    return await s3Client.send(new CompleteMultipartUploadCommand(params));
  } catch (error) {
    console.error('⚠️ Multipart upload дуусгахад алдаа гарлаа:', error);
    throw error;
  }
};

/**
 * Объектийг устгах
 */
export const removeObject = async (key: string) => {
  const params = {
    Bucket: SPACE_BUCKET_NAME,
    Key: key.split('/')[1]
  };

  const s3Response = await s3Client.send(new DeleteObjectCommand(params));
  console.log('delete response:', s3Response);

  return s3Response;
};

/**
 * Энгийн object upload хийх
 */
export const putObject = async ({
  key,
  file,
  acl,
  meta = {}
}: {
  key: string;
  file: any;
  acl: ObjectCannedACL;
  meta?: Record<string, string>;
}): Promise<PutObjectCommandOutput> => {
  const params: PutObjectCommandInput = {
    Bucket: SPACE_BUCKET_NAME,
    Key: key,
    Body: file,
    ACL: acl,
    Metadata: Object.keys(meta).length > 0 ? meta : undefined
  };

  try {
    return await s3Client.send(new PutObjectCommand(params));
  } catch (error) {
    console.error('⚠️ Объект хадгалахад алдаа гарлаа:', error);
    throw error;
  }
};

/**
 * Давтагдашгүй файл нэр үүсгэх
 */
export const generateUniqueFilename = (originalname: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = originalname.split('.').pop() || '';

  return `${timestamp}-${randomString}.${extension}`;
};

/**
 * Файлын signed URL авах (татаж авах эсвэл preview хийхэд ашиглана)
 */
export const getObjectSignedUrl = async (
  key: string,
  expiresIn?: number
): Promise<string> => {
  try {
    const params: GetObjectCommandInput = {
      Bucket: SPACE_BUCKET_NAME,
      Key: key
    };

    return await getSignedUrl(s3Client, new GetObjectCommand(params), {
      expiresIn
    });
  } catch (error) {
    console.error('⚠️ Signed URL авахад алдаа гарлаа:', error);
    throw error;
  }
};
