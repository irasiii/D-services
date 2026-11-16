# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/courier-web/Dockerfile -t d-services/courier-web .

FROM public.ecr.aws/docker/library/node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/charging/package.json packages/charging/
COPY apps/api/package.json apps/api/
COPY apps/courier-web/package.json apps/courier-web/
RUN npm ci
COPY apps/courier-web apps/courier-web
# The app calls the API on its own origin under /api; nginx forwards that to the API service.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build -w @d-services/courier-web

# Unprivileged nginx: runs as uid 101 and listens on 8080
FROM public.ecr.aws/nginx/nginx-unprivileged:stable-alpine AS runtime
ENV API_UPSTREAM=http://api:3000
COPY apps/courier-web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/courier-web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
