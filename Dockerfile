FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY docs ./docs
COPY templates ./templates
COPY tests ./tests
COPY scripts ./scripts
COPY apps-script ./apps-script
COPY README.md .

RUN npm run build

EXPOSE 8787
CMD ["node", "dist/index.js"]
