# syntax=docker/dockerfile:1

###############################################################################
# Build stage — installs every dependency, type-checks, tests and builds.
###############################################################################
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first so `npm ci` is cached until a dependency actually changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `npm run build` runs `tsc -b` before Vite, so a type error fails the image
# build rather than shipping a broken bundle.
RUN npm run build


###############################################################################
# Runtime stage — nginx serving the static bundle. No Node, no node_modules,
# no development dependencies.
###############################################################################
FROM nginx:1.29-alpine AS runtime

# Ledger is a static single-page app; nothing here needs root.
ENV NGINX_ENTRYPOINT_QUIET_LOGS=1

# The port nginx listens on inside the container. Override at build time only if
# you also change the healthcheck; to change the published port use compose.
ARG PORT=8080
ENV PORT=${PORT}

COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# nginx:alpine ships an unprivileged `nginx` user. Give it the directories it
# needs to write so the container can run without root.
RUN set -eux; \
    mkdir -p /var/cache/nginx /var/run; \
    chown -R nginx:nginx /var/cache/nginx /var/run /usr/share/nginx/html /etc/nginx/conf.d; \
    # A non-root process cannot bind below 1024, which is why PORT defaults to 8080.
    touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 8080

# Hits the dedicated endpoint rather than index.html, so the check stays cheap
# and does not depend on the bundle being present.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider "http://127.0.0.1:${PORT}/healthz" || exit 1

# The base image's entrypoint renders /etc/nginx/templates/*.template through
# envsubst, which is how ${PORT} reaches the config.
CMD ["nginx", "-g", "daemon off;"]
