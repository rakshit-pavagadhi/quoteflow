# Build Stage
FROM node:18-alpine AS builder

# Install OpenSSL for Prisma engine compatibility on Alpine
RUN apk add --no-cache openssl

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma/
RUN npx prisma generate
COPY . .
RUN npm run build

# Production Stage
FROM node:18-alpine

# Install OpenSSL for Prisma engine compatibility on Alpine
RUN apk add --no-cache openssl

WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 4000

# Push schema changes to database, then boot the server
CMD npx prisma db push && npm start