FROM ghcr.io/puppeteer/puppeteer:24.3.0

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .
CMD [ "node", "index.js" ]

# bu dosya aşşırı önemli render.com'a deploy etmek için