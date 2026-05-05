FROM golang:1.26-bookworm AS builder

WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend ./backend
WORKDIR /src/backend
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /usr/local/bin/backend ./cmd

FROM debian:bookworm-slim
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        libreoffice-core \
        libreoffice-impress \
        libreoffice-writer \
        fonts-dejavu-core \
        fontconfig \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/backend /usr/local/bin/backend

WORKDIR /app
EXPOSE 8082
CMD ["/usr/local/bin/backend"]
