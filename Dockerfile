ARG NODE_BASE_IMAGE

FROM ${NODE_BASE_IMAGE} AS build
WORKDIR /app
ENV CI=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci \
    && npx prisma generate

COPY tsconfig.json swagger.yaml ./
COPY src ./src
RUN npm run build \
    && find dist -type f -name '*.map' -delete

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM ${NODE_BASE_IMAGE} AS runtime-base
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init openssl \
    && rm -rf /var/lib/apt/lists/*

FROM runtime-base AS runtime-common
COPY --chown=node:node --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node --from=build /app/swagger.yaml ./swagger.yaml

USER node
ENTRYPOINT ["dumb-init", "--"]

FROM runtime-base AS migration
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --chown=node:node --from=build /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --chown=node:node --from=build /app/node_modules/@prisma/debug ./node_modules/@prisma/debug
COPY --chown=node:node --from=build /app/node_modules/@prisma/engines-version ./node_modules/@prisma/engines-version
COPY --chown=node:node --from=build /app/node_modules/@prisma/fetch-engine ./node_modules/@prisma/fetch-engine
COPY --chown=node:node --from=build /app/node_modules/@prisma/get-platform ./node_modules/@prisma/get-platform
COPY --chown=node:node --from=build /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node scripts/preflight-attendance-deploy.sql ./scripts/preflight-attendance-deploy.sql
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "db:migrate:deploy"]

FROM runtime-common AS outbox-worker
ENV OUTBOX_HEALTH_PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const http=require('node:http');const port=process.env.OUTBOX_HEALTH_PORT||'3001';const req=http.get({host:'127.0.0.1',port,path:'/health'},res=>process.exit(res.statusCode===200?0:1));req.setTimeout(4000,()=>{req.destroy();process.exit(1)});req.on('error',()=>process.exit(1));"]
CMD ["npm", "run", "start:outbox"]

FROM runtime-common AS api
ENV OUTBOX_WORKER_ENABLED=false
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const http=require('node:http');const port=process.env.PORT||'3000';const req=http.get({host:'127.0.0.1',port,path:'/health'},res=>process.exit(res.statusCode===200?0:1));req.setTimeout(4000,()=>{req.destroy();process.exit(1)});req.on('error',()=>process.exit(1));"]
CMD ["npm", "run", "start:api"]
