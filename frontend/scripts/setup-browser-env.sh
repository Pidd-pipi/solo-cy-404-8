#!/usr/bin/env bash
# 在没有 root / 系统包管理器权限的环境里，为 Playwright Chromium 补齐运行所需的共享库。
# - 已是普通 CI（系统已装 Chromium 依赖）时：浏览器可直接启动，本脚本无需做任何事。
# - 已引导过（.playwright-libs/.ready 存在）时：立即返回，保证可重复、幂等。
# - 否则：从 Debian 镜像把所需 .deb 下载并解压到本地 .playwright-libs（gitignored），
#   playwright.config.ts 会自动把它加入 LD_LIBRARY_PATH。全程不需要 sudo，也不写入仓库根目录。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIBS_DIR="$ROOT/.playwright-libs"
MARKER="$LIBS_DIR/.ready"
mkdir -p "$LIBS_DIR"

if [ -f "$MARKER" ]; then
  exit 0
fi

# 汇总 .playwright-libs 下所有含 .so 的目录，供探测时注入 LD_LIBRARY_PATH。
collect_libpath() {
  find "$LIBS_DIR" -name '*.so*' -type f -exec dirname {} \; 2>/dev/null | sort -u | paste -sd:
}
probe_browser() {
  local extra="${LD_LIBRARY_PATH:-}"
  local local_path; local_path="$(collect_libpath || true)"
  LD_LIBRARY_PATH="${local_path}${local_path:+:}${extra}" node -e \
    "import('@playwright/test').then(async ({chromium})=>{const b=await chromium.launch();const p=await b.newPage();await p.close();await b.close();}).catch((e)=>{console.error(e.message);process.exit(1);})" \
    >/dev/null 2>&1
}

# 1) 浏览器能直接启动则无需引导（依赖已装或本地库已就位）。
if probe_browser; then
  touch "$MARKER"
  exit 0
fi

# 2) 需要工具：dpkg-deb 与 curl；缺失则提示后退出（普通系统交给 `playwright install-deps`）。
for bin in dpkg-deb curl; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "[setup-browser-env] 缺少 $bin；请在有 root 的环境运行 \`npx playwright install-deps chromium\`。" >&2
    exit 1
  fi
done

ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"
case "$ARCH" in
  arm64|aarch64) DIST="bookworm"; ARCH_DIR="arm64" ;;
  amd64|x86_64) DIST="bookworm"; ARCH_DIR="amd64" ;;
  *) echo "[setup-browser-env] 未支持的架构: $ARCH" >&2; exit 1 ;;
esac

PACKAGES=(
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxi6 libxkbcommon0
  libasound2 libatk1.0-0 libatspi2.0-0 libdbus-1-3 libgbm1 libdrm2
  libnspr4 libnss3 libwayland-server0
)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
BASE="http://deb.debian.org/debian"
INDEX="$WORK/Packages"
echo "[setup-browser-env] 下载 Debian($DIST/$ARCH_DIR) 包索引以定位 Chromium 依赖…"
curl -fsSL "$BASE/dists/$DIST/main/binary-$ARCH_DIR/Packages.gz" -o "$INDEX.gz"
gzip -df "$INDEX.gz"

mkdir -p "$LIBS_DIR" "$WORK/debs"
for pkg in "${PACKAGES[@]}"; do
  # 从 Debian 包索引解析该包的 Filename。
  filename="$(python3 - "$pkg" "$INDEX" <<'PY'
import sys
pk, path = sys.argv[1], sys.argv[2]
for block in open(path, encoding="utf-8", errors="replace").read().split("\n\n"):
    if block.startswith(f"Package: {pk}\n"):
        for line in block.splitlines():
            if line.startswith("Filename: "):
                print(line[10:]); raise SystemExit
PY
)"
  if [ -z "$filename" ]; then
    echo "[setup-browser-env] 警告：未在索引中找到 $pkg，跳过（可能系统已提供）。" >&2
    continue
  fi
  deb="$WORK/debs/${filename##*/}"
  echo "[setup-browser-env] 获取 ${filename##*/}"
  curl -fsSL "$BASE/$filename" -o "$deb"
  dpkg-deb -x "$deb" "$LIBS_DIR"
done

# 3) 再验一次；通过则打标记。
if node -e "import('@playwright/test').then(async ({chromium})=>{const b=await chromium.launch();const p=await b.newPage();await p.close();await b.close();})" >/dev/null 2>&1; then
  touch "$MARKER"
  echo "[setup-browser-env] 完成：本地依赖位于 $LIBS_DIR（已 gitignore）。"
else
  echo "[setup-browser-env] 依赖补齐后浏览器仍无法启动，请用 \`npx playwright install-deps chromium\` 安装系统依赖。" >&2
  exit 1
fi
