FROM node:20-bookworm-slim AS build-env
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build-env /app/build ./build
COPY --from=build-env /app/public ./public
EXPOSE 3000
CMD ["npm", "run", "start"]