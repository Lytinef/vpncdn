# Кросс-сборка amneziawg-go (userspace AmneziaWG) под клиентов Unway:
#   Windows (amd64) и Android (arm64, armv7).
# amneziawg-go — Go, собирается без CGO (TUN: wintun на Windows, WG_TUN_FD на Android).
#
# Сборка и извлечение бинарей на хост:
#   docker build -f client/native/amneziawg/build-binaries.Dockerfile \
#     --target export -o client/native/amneziawg/out .
# Результат в client/native/amneziawg/out/:
#   amneziawg-go.exe                  → client/windows/bin/amneziawg-go.exe
#   amneziawg-go-android-arm64        → app/src/full/jniLibs/arm64-v8a/libawg.so
#   amneziawg-go-android-arm          → app/src/full/jniLibs/armeabi-v7a/libawg.so
#
# Тул `awg` (применение конфига) под клиентов берём из релизов AmneziaWG/AmneziaVPN
# (см. native/amneziawg/README.md) — кросс-сборка C-tools тут не делается.

FROM golang:1.25-alpine AS build
RUN apk add --no-cache git
RUN git clone --depth=1 https://github.com/amnezia-vpn/amneziawg-go /src
WORKDIR /src
RUN CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o /out/amneziawg-go.exe . \
 && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o /out/amneziawg-go-android-arm64 . \
 && CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 go build -ldflags="-s -w" -o /out/amneziawg-go-android-arm .

FROM scratch AS export
COPY --from=build /out/ /
