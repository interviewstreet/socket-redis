FROM node:10

WORKDIR '/opt/socket-redis'

ADD https://git.io/vyCoJ /usr/local/bin/wait-for-it
RUN chmod a+x /usr/local/bin/wait-for-it
COPY package.json package-lock.json ./
RUN npm ci --only=production
COPY . ./

EXPOSE 8085 8090 8091
CMD ["./bin/socket-redis.js"]
