#!/bin/sh
set -e
cd "$(dirname "$0")"
npx esbuild src/main.ts --bundle --minify --format=esm --target=es2022 --loader:.woff2=dataurl --loader:.woff=dataurl --outfile=artifact/app.js
