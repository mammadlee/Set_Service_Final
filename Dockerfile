ARG NODE_BASE_IMAGE
ARG RUNTIME_BASE_IMAGE

FROM ${NODE_BASE_IMAGE} AS build
WORKDIR /app
ENV CI=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --global --ignore-scripts --no-audit --no-fund npm@11.21.1 \
    && test "$(npm --version)" = "11.21.1"

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci \
    && npx prisma generate

COPY tsconfig.json tsconfig.provisioner.json swagger.yaml ./
COPY src ./src
COPY scripts/provision-store-review.ts scripts/review-account-readiness.ts scripts/run-store-review-provisioner.ts ./scripts/
RUN npm run build \
    && ./node_modules/.bin/tsc -p tsconfig.provisioner.json \
    && find dist provisioner-dist -type f -name '*.map' -delete

FROM build AS production-dependencies
RUN npm prune --omit=dev

# DSA-6613-1: authenticated Debian 13 security backport, pending distroless rebuild.
# Extract the reviewed package without executing maintainer scripts. See docs/runtime-zlib-security-update.md.
FROM build AS runtime-security-package
WORKDIR /security-update
ADD --checksum=sha256:8c27c342230503b73dfde629642c3b352e87b554e06d60cf58772f236a305ceb https://security.debian.org/debian-security/pool/updates/main/z/zlib/zlib1g_1.3.dfsg+really1.3.1-1+deb13u1_amd64.deb ./zlib1g.deb
RUN set -eu; \
    test "$(dpkg --print-architecture)" = amd64; \
    test "$(dpkg-deb -f zlib1g.deb Package)" = zlib1g; \
    test "$(dpkg-deb -f zlib1g.deb Version)" = '1:1.3.dfsg+really1.3.1-1+deb13u1'; \
    test "$(dpkg-deb -f zlib1g.deb Architecture)" = amd64; \
    dpkg-deb --extract zlib1g.deb root; \
    dpkg-deb --control zlib1g.deb control; \
    printf '%s\n' usr/lib/x86_64-linux-gnu/libz.so.1.3.1 usr/share/doc/zlib1g/changelog.Debian.gz usr/share/doc/zlib1g/changelog.gz usr/share/doc/zlib1g/copyright | LC_ALL=C sort > files.expected; \
    find root -type f -printf '%P\n' | LC_ALL=C sort > files.actual; \
    diff -u files.expected files.actual; \
    test "$(find root -type l -printf '%P\n')" = usr/lib/x86_64-linux-gnu/libz.so.1; \
    test "$(readlink root/usr/lib/x86_64-linux-gnu/libz.so.1)" = libz.so.1.3.1; \
    test -z "$(find root ! -type f ! -type d ! -type l -print)"; \
    test -z "$(find root -perm /6000 -print)"; \
    echo '6c13931760210e8b391b63a337dfe4071346c4ad6e3827694edb7b6989bb16dd  root/usr/lib/x86_64-linux-gnu/libz.so.1.3.1' | sha256sum -c -; \
    (cd root && md5sum -c ../control/md5sums); \
    mkdir -p root/var/lib/dpkg/status.d; \
    { printf 'Status: install ok installed\n'; cat control/control; } > root/var/lib/dpkg/status.d/zlib1g; \
    cp control/md5sums root/var/lib/dpkg/status.d/zlib1g.md5sums

FROM ${RUNTIME_BASE_IMAGE} AS app-runtime-base
COPY --from=runtime-security-package /security-update/root/ /
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

FROM app-runtime-base AS migration
COPY --chown=65532:65532 --from=production-dependencies /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --chown=65532:65532 --from=production-dependencies /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=65532:65532 --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --chown=65532:65532 --from=build /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --chown=65532:65532 --from=build /app/node_modules/@prisma/debug ./node_modules/@prisma/debug
COPY --chown=65532:65532 --from=build /app/node_modules/@prisma/engines-version ./node_modules/@prisma/engines-version
COPY --chown=65532:65532 --from=build /app/node_modules/@prisma/fetch-engine ./node_modules/@prisma/fetch-engine
COPY --chown=65532:65532 --from=build /app/node_modules/@prisma/get-platform ./node_modules/@prisma/get-platform
COPY --chown=65532:65532 --from=build /app/prisma ./prisma
COPY --chown=65532:65532 scripts/preflight-attendance-deploy.mjs ./scripts/preflight-attendance-deploy.mjs
COPY --chown=65532:65532 scripts/preflight-attendance-deploy.sql ./scripts/preflight-attendance-deploy.sql
COPY --chown=65532:65532 scripts/run-prisma-migrate-deploy.mjs ./scripts/run-prisma-migrate-deploy.mjs
USER 65532:65532
ENTRYPOINT ["/nodejs/bin/node"]
CMD ["scripts/run-prisma-migrate-deploy.mjs"]

FROM app-runtime-base AS runtime-common
COPY --chown=65532:65532 --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --chown=65532:65532 --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=65532:65532 --from=build /app/dist ./dist
COPY --chown=65532:65532 --from=build /app/prisma ./prisma
COPY --chown=65532:65532 --from=build /app/swagger.yaml ./swagger.yaml

USER 65532:65532
ENTRYPOINT ["/nodejs/bin/node"]

FROM app-runtime-base AS reviewer-provisioner
COPY --chown=65532:65532 --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --chown=65532:65532 --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=65532:65532 --from=build /app/provisioner-dist ./provisioner-dist
COPY --chown=65532:65532 --from=build /app/prisma ./prisma
USER 65532:65532
ENTRYPOINT ["/nodejs/bin/node", "provisioner-dist/scripts/run-store-review-provisioner.js"]
CMD ["plan"]

FROM runtime-common AS outbox-worker
ENV OUTBOX_HEALTH_PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "const http=require('node:http');const port=process.env.OUTBOX_HEALTH_PORT||'3001';const req=http.get({host:'127.0.0.1',port,path:'/health'},res=>process.exit(res.statusCode===200?0:1));req.setTimeout(4000,()=>{req.destroy();process.exit(1)});req.on('error',()=>process.exit(1));"]
CMD ["dist/outbox-worker.js"]

FROM app-runtime-base AS malware-scanner
ENV PORT=8080
COPY --chown=65532:65532 --from=build /app/dist/malware-scanner ./dist/malware-scanner
USER 65532:65532
ENTRYPOINT ["/nodejs/bin/node"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["/nodejs/bin/node", "-e", "const http=require('node:http');const req=http.get({host:'127.0.0.1',port:8080,path:'/health'},res=>process.exit(res.statusCode===200?0:1));req.setTimeout(4000,()=>{req.destroy();process.exit(1)});req.on('error',()=>process.exit(1));"]
CMD ["dist/malware-scanner/index.js"]

FROM runtime-common AS api
ENV OUTBOX_WORKER_ENABLED=false
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "const http=require('node:http');const port=process.env.PORT||'3000';const req=http.get({host:'127.0.0.1',port,path:'/health'},res=>process.exit(res.statusCode===200?0:1));req.setTimeout(4000,()=>{req.destroy();process.exit(1)});req.on('error',()=>process.exit(1));"]
CMD ["dist/index.js"]
