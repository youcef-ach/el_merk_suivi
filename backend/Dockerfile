FROM node:20-bookworm

# Install wasmtime and gltfpack for Linux 3D decimation & KTX2 encoding
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates xz-utils unzip && \
    curl -sL https://github.com/bytecodealliance/wasmtime/releases/download/v48.0.1/wasmtime-v48.0.1-x86_64-linux.tar.xz -o /tmp/wasmtime.tar.xz && \
    tar -xf /tmp/wasmtime.tar.xz -C /tmp && \
    mv /tmp/wasmtime-v48.0.1-x86_64-linux/wasmtime /usr/local/bin/wasmtime && \
    curl -sL https://github.com/zeux/meshoptimizer/releases/download/v1.2/gltfpack-ubuntu.zip -o /tmp/gltfpack.zip && \
    unzip -q -o /tmp/gltfpack.zip -d /usr/local/bin && \
    chmod +x /usr/local/bin/wasmtime /usr/local/bin/gltfpack && \
    rm -rf /tmp/* /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push && npm run start:prod"]