# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/api/Dockerfile -t d-services/api .
# Base images come from Amazon ECR Public (no Docker Hub pull limits on AWS).

FROM public.ecr.aws/docker/library/node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/charging/package.json packages/charging/
COPY apps/api/package.json apps/api/
COPY apps/courier-web/package.json apps/courier-web/

FROM base AS build
RUN npm ci
COPY packages/charging packages/charging
COPY apps/api apps/api
RUN npm run build -w @d-services/charging && npm run build -w @d-services/api

FROM base AS prod-deps
RUN npm ci --omit=dev -w @d-services/api -w @d-services/charging && npm cache clean --force

FROM public.ecr.aws/docker/library/node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000
# The API only needs the Node.js runtime. Removing the bundled package managers also removes
# their dependencies, which are where image scans keep finding vulnerabilities.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/package.json ./
COPY --from=build /app/packages/charging/package.json packages/charging/
COPY --from=build /app/packages/charging/dist packages/charging/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/migrations apps/api/migrations
# Amazon RDS certificate authorities, so the API can verify the database's TLS certificate
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem
# Run as the unprivileged "node" user (uid 1000) that ships with the image
USER 1000
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
