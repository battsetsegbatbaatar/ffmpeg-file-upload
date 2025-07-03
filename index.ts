// 1. Модуль импорт
import express, { Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import './src/init/worker';

import config from './src/config';
import { NeonDB } from './src/config/database';
import { removeObject } from './src/init/initFile';
import { videoQueue } from './src/init/docker/videoQueue';

const { JWT_SECRET } = config;

// 2. Сервер болон фолдеруудыг тохируулах
const app = express();
app.use(express.json());
const port = 3000;

const uploadFolder = path.join(__dirname, 'uploads');
const outputFolder = path.join(__dirname, 'outputs');

if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder);
if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder);

// 3. Multer тохиргоо
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadFolder),
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      '-' +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// 4. Middleware
app.use((req, res, next) => {
  console.log(`📡 Request: ${req.method} ${req.url}`);
  next();
});
app.use('/outputs', express.static(outputFolder));
app.use('/', express.static(path.join(__dirname, 'dist')));

// 5. POST /delete - Видео устгах
app.post('/delete', async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.body.id;
    if (!id) {
      return res.status(400).json({ message: 'ID оруулаагүй байна.' });
    }

    await removeObject(id);
    const response = await NeonDB`
    DELETE FROM "Files" WHERE id = ${id.split('/')[1]} RETURNING *;
  `;
    return res.status(200).json({ message: 'Амжилттай устгалаа.', response });
  } catch (error) {
    console.error('Delete алдаа:', error);
    return res
      .status(500)
      .json({ message: 'Устгах явцад алдаа гарлаа.', error });
  }
});

// 6. POST /upload - Видео queue-д оруулах
app.post(
  '/upload',
  upload.single('video'),
  async (req: Request, res: Response): Promise<void> => {
    console.log(req.headers);
    console.log(req.headers['authorization']);
    const token = req.headers['authorization'];
    if (!token) {
      res.status(401).json({ success: false, message: 'Нэвтрээгүй байна.' });
      return;
    }

    const auth = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (!auth?.userId) {
      res.status(401).json({ success: false, message: 'Та нэвтрээгүй байна' });
    }

    if (!req.file) {
      res.status(400).json({ error: '🎥 Видео файл оруулна уу' });
      return;
    }

    const file = req.file;

    try {
      const job = await videoQueue.add('video-convert', {
        filename: file.originalname,
        file,
        userId: auth.userId
      });

      res.json({
        message: '📥 Queue-д амжилттай нэмэгдлээ',
        jobId: job.id
      });
    } catch (err) {
      console.error('❌ Queue-д нэмэх үед алдаа:', err);
      res.status(500).json({ error: 'Queue-д нэмэхэд алдаа гарлаа' });
    }
  }
);

// 7. GET /job/:id/result - хувиргалтын үр дүн шалгах
app.get(
  '/job/:id/result',
  async (req: Request, res: Response): Promise<void> => {
    const jobId = req.params.id;

    try {
      const job = await videoQueue.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job олдсонгүй' });
        return;
      }

      const state = await job.getState();
      if (state === 'completed') {
        try {
          if (fs.existsSync(job.inputPath)) fs.unlinkSync(job.inputPath);
          if (fs.existsSync(job.outputDir))
            fs.rmSync(job.outputDir, { recursive: true, force: true });
        } catch (err) {
          console.error('📛 Файл устгах үед алдаа:', err);
        }

        res.json({
          status: '✅ Хувиргасан',
          outputs: job.returnvalue
        });
      } else if (state === 'failed') {
        res
          .status(500)
          .json({ status: '❌ Амжилтгүй', reason: job.failedReason });
      } else {
        res.json({ status: `⏳ ${state} байна` });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Job шалгах үед алдаа гарлаа' });
    }
  }
);

// 8. DB шалгах
app.get('/db-check', async (_req: Request, res: Response) => {
  try {
    const result = await NeonDB`SELECT version()`;
    res.status(200).send(`🧠 PostgreSQL version: ${result[0].version}`);
  } catch (err) {
    console.error('❌ DB шалгах үед алдаа:', err);
    res.status(500).send('DB шалгах үед алдаа гарлаа');
  }
});

// 9. SPA index.html-г serve хийх
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 10. Серверээ ажиллуулах
app.listen(port, () => {
  console.log(`🌐 Сервер http://localhost:${port} дээр ажиллаж байна`);
});
