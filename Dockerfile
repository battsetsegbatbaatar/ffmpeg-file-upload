FROM node:20

WORKDIR /app

# package.json болон package-lock.json хуулж, суулгах
COPY package*.json ./
RUN npm install

# ✅ FFmpeg суулгах (Debian-based Node image тул apt ашиглана)
RUN apt-get update && apt-get install -y ffmpeg

# бүх файлыг хуулна
COPY . .

# build хийж index.html-ийг dist руу хуулна
RUN npm run build && cp index.html dist/index.html

EXPOSE 3000

CMD ["node", "dist/index.js"]