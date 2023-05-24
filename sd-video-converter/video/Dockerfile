FROM node:14-alpine

RUN apk update && apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm install



CMD ["node", "video-conversion.js"]
