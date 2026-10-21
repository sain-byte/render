# FFmpeg.wasm Render — 1080p CRF 24 H.264

Pure browser video transcoder using **official ffmpeg.wasm 0.12.x**.

Semua proses jalan di browser user. File **tidak pernah** di-upload ke server.

## Fitur

- Upload video apa saja
- Transcode ke **1080p** (scale height=1080, keep aspect, even width)
- Codec **libx264**, **CRF 24**, preset medium
- Audio **AAC 128k**
- `yuv420p` + `+faststart` → siap putar di web
- Progress + log real-time
- Download hasil

Command yang dijalankan:

```bash
ffmpeg -i input \
  -vf scale=-2:1080 \
  -c:v libx264 -crf 24 -preset medium \
  -c:a aac -b:a 128k \
  -pix_fmt yuv420p \
  -movflags +faststart \
  output.mp4
```

## Test localhost

```bash
cd ffmpeg-wasm-render
python3 -m http.server 3000
# atau
npx serve -p 3000
```

Buka http://localhost:3000

1. Klik **Load FFmpeg** (sekali, ~31 MB core di-download & di-cache browser)
2. Pilih video
3. Klik **Render 1080p CRF24**
4. Tunggu selesai → Download

Ada `test_input.mp4` (3 detik 720p) di folder ini buat uji cepat.

## Deploy GitHub Pages

1. Push seluruh folder ini ke repo (termasuk `vendor/`)
2. Settings → Pages → Deploy from a branch → `main` / `/ (root)`
3. Selesai. Langsung jalan karena pure static.

> **Catatan penting**:  
> - Single-thread core dipakai biar kompatibel di hampir semua browser modern **tanpa** perlu header COOP/COEP.  
> - Multi-thread lebih cepat, tapi butuh `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`.

## Struktur

```
.
├── index.html
├── app.js
├── README.md
├── test_input.mp4          # sample buat test
└── vendor/
    ├── ffmpeg/             # @ffmpeg/ffmpeg@0.12.10
    ├── util/               # @ffmpeg/util@0.12.1
    └── core/               # @ffmpeg/core@0.12.10 (single-thread)
```

Semua package di-host same-origin → gak ada CORS / Worker cross-origin error.

## Tech & referensi

- https://github.com/ffmpegwasm/ffmpeg.wasm
- https://ffmpegwasm.netlify.app/docs/getting-started/usage/
- API 0.12.x: `new FFmpeg()` → `load()` → `writeFile()` → `exec()` → `readFile()`

Sudah diuji load berhasil di localhost (FFmpeg Loaded ✓).
