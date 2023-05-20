FROM node:14-alpine

RUN apk update && apk add --no-cache ffmpeg

WORKDIR /app

RUN npm install --production

CMD ["node", "video-conversion.js"]
