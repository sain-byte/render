import { FFmpeg } from "./vendor/ffmpeg/dist/esm/index.js";
import {
  fetchFile,
  toBlobURL
} from "./vendor/util/dist/esm/index.js";

/* ============================================================
   DOM HELPER
============================================================ */

const $ = (id) => document.getElementById(id);

const els = {
  drop: $("drop"),
  fileInput: $("file-input"),

  selectedName: $("selected-name"),

  inputPreview: $("input-preview"),
  sourceVideo: $("source-video"),
  previewName: $("preview-name"),
  previewSize: $("preview-size"),

  clearBtn: $("btn-clear"),
  clearInline: $("btn-clear-inline"),

  drBanner: $("dr-banner"),

  infoSize: $("info-size"),
  infoDuration: $("info-duration"),
  infoResolution: $("info-resolution"),
  infoFps: $("info-fps"),
  infoDr: $("info-dr"),
  infoRotation: $("info-rotation"),
  infoBitDepth: $("info-bitdepth"),
  infoAudio: $("info-audio"),

  crfButtons: document.querySelectorAll("[data-crf]"),
  encoderCrf: $("encoder-crf"),

  renderBtn: $("btn-render"),

  pct: $("progress-pct"),
  bar: $("progress-bar"),
  elapsed: $("time-elapsed"),
  eta: $("time-eta"),

  status: $("status"),
  log: $("log"),
  copyLog: $("btn-copy-log"),

  outputSection: $("output-section"),
  preview: $("preview"),
  outputInfo: $("output-info"),

  patchBtn: $("btn-patch"),
  patchStatus: $("patch-status"),
  downloadBtn: $("btn-download"),

  pipeRender: $("pipe-render"),
  pipePatch: $("pipe-patch"),
  pipeDone: $("pipe-done"),

  tutorialBtn: $("btn-tutorial"),
  supportBtn: $("btn-support"),

  musicBtn: $("btn-music"),
  musicInput: $("music-input"),
  musicName: $("music-name"),
  musicClear: $("btn-music-clear")
};


/* ============================================================
   CONFIG
============================================================ */

const INPUT_NAME = "input.mp4";
const OUTPUT_NAME = "output.mp4";

const MAX_SHORT_SIDE = 1080;

const COMPRESSBASE_URL =
  "https://compressbase.com/method-api/client.mjs";

const PATCH_VARIANT =
  "variant-3";

/* Metadata yang ditulis ke hasil render */
const META_TEXT = "Render by @totolat";

/* Musik pengganti: durasi ikut video, fade out di ujung */
const MUSIC_FADE_OUT = 1.5;
const MUSIC_EXTS = ["mp3", "m4a", "aac", "wav", "flac", "ogg", "opus"];

let ffmpeg = null;
let ffmpegLoaded = false;

let selectedFile = null;
let selectedMusic = null;
let musicFsName = "music.mp3";

let renderedBlob = null;
let finalBlob = null;

let sourceMeta = null;
let finalMeta = null;

let currentCRF = 24;

let renderStart = 0;
let elapsedTimer = null;

let isProcessing = false;


/* ============================================================
   LOG
============================================================ */

function log(message = "") {
  if (!els.log) return;

  els.log.textContent += message + "\n";
  els.log.scrollTop = els.log.scrollHeight;
}


function clearLog() {
  if (!els.log) return;
  els.log.textContent = "";
}


function setStatus(message, error = false) {
  if (!els.status) return;

  els.status.textContent = message;
  els.status.classList.toggle("error", error);
}


/* ============================================================
   TIME
============================================================ */

function formatTime(seconds) {

  if (
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return "--:--";
  }

  seconds = Math.floor(seconds);

  const h =
    Math.floor(seconds / 3600);

  const m =
    Math.floor(
      (seconds % 3600) / 60
    );

  const s =
    seconds % 60;

  if (h > 0) {

    return (
      String(h).padStart(2, "0") +
      ":" +
      String(m).padStart(2, "0") +
      ":" +
      String(s).padStart(2, "0")
    );
  }

  return (
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0")
  );
}


function startTimer() {

  renderStart =
    performance.now();

  clearInterval(elapsedTimer);

  elapsedTimer =
    setInterval(() => {

      const elapsed =
        (
          performance.now() -
          renderStart
        ) / 1000;

      if (els.elapsed) {
        els.elapsed.textContent =
          formatTime(elapsed);
      }

    }, 250);
}


function stopTimer() {

  clearInterval(elapsedTimer);

  elapsedTimer = null;
}


/* ============================================================
   PROGRESS
============================================================ */

function setProgress(value) {

  value = Math.max(
    0,
    Math.min(100, value)
  );

  if (els.pct) {
    els.pct.textContent =
      `${Math.round(value)}%`;
  }

  if (els.bar) {
    els.bar.style.width =
      `${value}%`;
  }
}


function updateETA(progress) {

  if (
    !renderStart ||
    progress <= 0 ||
    progress >= 100
  ) {

    if (els.eta) {
      els.eta.textContent =
        "--:--";
    }

    return;
  }

  const elapsed =
    (
      performance.now() -
      renderStart
    ) / 1000;

  const remaining =
    elapsed *
    (100 / progress - 1);

  if (els.eta) {
    els.eta.textContent =
      formatTime(remaining);
  }
}


/* ============================================================
   PIPELINE
============================================================ */

function resetPipeline() {

  els.pipeRender?.classList.remove(
    "active",
    "done",
    "error"
  );

  els.pipePatch?.classList.remove(
    "active",
    "done",
    "error"
  );

  els.pipeDone?.classList.remove(
    "active",
    "done",
    "error"
  );

  els.pipeRender?.classList.add(
    "active"
  );
}


function renderPipelineDone() {

  els.pipeRender?.classList.remove(
    "active"
  );

  els.pipeRender?.classList.add(
    "done"
  );

  els.pipePatch?.classList.add(
    "active"
  );
}


function patchPipelineDone() {

  els.pipePatch?.classList.remove(
    "active"
  );

  els.pipePatch?.classList.add(
    "done"
  );

  els.pipeDone?.classList.add(
    "active"
  );
}


function pipelineComplete() {

  els.pipeDone?.classList.remove(
    "active"
  );

  els.pipeDone?.classList.add(
    "done"
  );
}


function pipelineError(stage = "render") {

  if (stage === "render") {

    els.pipeRender?.classList.remove(
      "active"
    );

    els.pipeRender?.classList.add(
      "error"
    );

  } else {

    els.pipePatch?.classList.remove(
      "active"
    );

    els.pipePatch?.classList.add(
      "error"
    );
  }
}


/* ============================================================
   FFMPEG LOAD
============================================================ */

async function loadFFmpeg() {

  if (ffmpegLoaded) {
    return;
  }

  setStatus(
    "Loading FFmpeg…"
  );

  log(
    "FFmpeg core loading…"
  );

  ffmpeg =
    new FFmpeg();

  ffmpeg.on(
    "log",
    ({ message }) => {
      log(message);
    }
  );

  ffmpeg.on(
    "progress",
    ({ progress }) => {

      if (!renderStart) {
        return;
      }

      const pct =
        Math.max(
          0,
          Math.min(
            1,
            progress
          )
        ) * 100;

      setProgress(pct);
      updateETA(pct);
    }
  );

  const base =
    "./vendor/core/dist/esm";

  await ffmpeg.load({

    coreURL:
      await toBlobURL(
        `${base}/ffmpeg-core.js`,
        "text/javascript"
      ),

    wasmURL:
      await toBlobURL(
        `${base}/ffmpeg-core.wasm`,
        "application/wasm"
      )
  });

  ffmpegLoaded = true;

  log(
    "FFmpeg core loaded."
  );
}


/* ============================================================
   FILE SIZE
============================================================ */

function formatBytes(bytes) {

  if (
    !Number.isFinite(bytes)
  ) {
    return "—";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (
    bytes <
    1024 * 1024
  ) {

    return (
      `${(
        bytes / 1024
      ).toFixed(1)} KB`
    );
  }

  if (
    bytes <
    1024 * 1024 * 1024
  ) {

    return (
      `${(
        bytes /
        1024 /
        1024
      ).toFixed(2)} MB`
    );
  }

  return (
    `${(
      bytes /
      1024 /
      1024 /
      1024
    ).toFixed(2)} GB`
  );
}


/* ============================================================
   BITRATE
============================================================ */

function formatBitrate(bitsPerSecond) {

  if (
    !Number.isFinite(
      bitsPerSecond
    ) ||
    bitsPerSecond <= 0
  ) {
    return "—";
  }

  if (
    bitsPerSecond >=
    1000000
  ) {

    return (
      `${(
        bitsPerSecond /
        1000000
      ).toFixed(2)} Mbps`
    );
  }

  return (
    `${(
      bitsPerSecond /
      1000
    ).toFixed(0)} kbps`
  );
}


function calculateBitrate(
  sizeBytes,
  duration
) {

  if (
    !sizeBytes ||
    !duration ||
    duration <= 0
  ) {
    return 0;
  }

  return (
    sizeBytes *
    8 /
    duration
  );
}


/* ============================================================
   FPS
============================================================ */

function parseFPS(value) {

  if (!value) {
    return 0;
  }

  if (
    value.includes("/")
  ) {

    const parts =
      value.split("/");

    const a =
      Number(parts[0]);

    const b =
      Number(parts[1]);

    if (
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      b !== 0
    ) {

      return a / b;
    }
  }

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}


/* ============================================================
   PROBE VIDEO
============================================================ */

async function probeVideo(file) {

  log(
    "Reading media information…"
  );

  try {
    await ffmpeg.deleteFile(
      INPUT_NAME
    );
  } catch {}

  await ffmpeg.writeFile(
    INPUT_NAME,
    await fetchFile(file)
  );

  const probeLogs = [];

  const listener =
    ({ message }) => {
      probeLogs.push(message);
    };

  ffmpeg.on(
    "log",
    listener
  );

  try {

    await ffmpeg.exec([
      "-hide_banner",
      "-i",
      INPUT_NAME,
      "-t",
      "0.001",
      "-map",
      "0:v:0?",
      "-f",
      "null",
      "-"
    ]);

  } catch {

    /*
      Metadata normally appears
      before FFmpeg finishes.
    */
  }

  if (
    typeof ffmpeg.off ===
    "function"
  ) {

    ffmpeg.off(
      "log",
      listener
    );
  }

  return parseProbeText(
    probeLogs.join("\n")
  );
}


/* ============================================================
   PARSE PROBE
============================================================ */

function parseProbeText(text) {

  const meta = {

    width: 0,
    height: 0,

    fps: 0,
    duration: 0,

    videoCodec: "—",
    profile: "—",

    pixelFormat: "—",
    bitDepth: 8,

    dynamicRange: "SDR",

    colorspace: "—",
    colorTransfer: "—",

    rotation: 0,

    audioPresent: false,
    audioCodec: null,

    bitrate: 0
  };


  /* ----------------------------------------------------------
     DURATION
  ---------------------------------------------------------- */

  const durationMatch =
    text.match(
      /Duration:\s*(\d+):(\d+):([\d.]+)/
    );

  if (durationMatch) {

    meta.duration =
      Number(
        durationMatch[1]
      ) * 3600 +

      Number(
        durationMatch[2]
      ) * 60 +

      Number(
        durationMatch[3]
      );
  }


  /* ----------------------------------------------------------
     VIDEO
  ---------------------------------------------------------- */

  const videoMatch =
    text.match(
      /Video:\s*([^\s,(]+)\s*(?:\(([^)]+)\))?.*?(\d{2,5})x(\d{2,5})/
    );

  if (videoMatch) {

    meta.videoCodec =
      videoMatch[1] ||
      "—";

    meta.profile =
      videoMatch[2] ||
      "—";

    meta.width =
      Number(
        videoMatch[3]
      );

    meta.height =
      Number(
        videoMatch[4]
      );
  }


  /* ----------------------------------------------------------
     FPS
  ---------------------------------------------------------- */

  const fpsMatch =
    text.match(
      /([\d.]+)\s*fps/
    );

  if (fpsMatch) {

    meta.fps =
      Number(
        fpsMatch[1]
      );
  }

  if (!meta.fps) {

    const tbrMatch =
      text.match(
        /([\d.]+)\s*tbr/
      );

    if (tbrMatch) {

      meta.fps =
        Number(
          tbrMatch[1]
        );
    }
  }


  /* ----------------------------------------------------------
     PIXEL FORMAT
  ---------------------------------------------------------- */

  const pixelMatch =
    text.match(
      /\b(yuv(?:420|422|444)[a-z0-9_]*|gray[a-z0-9_]*)\b/i
    );

  if (pixelMatch) {

    meta.pixelFormat =
      pixelMatch[1];

    if (
      /12/.test(
        meta.pixelFormat
      )
    ) {

      meta.bitDepth = 12;

    } else if (
      /10/.test(
        meta.pixelFormat
      )
    ) {

      meta.bitDepth = 10;

    } else {

      meta.bitDepth = 8;
    }
  }


  /* ----------------------------------------------------------
     HDR / COLOR
  ---------------------------------------------------------- */

  const lower =
    text.toLowerCase();


  if (
    lower.includes(
      "smpte2084"
    ) ||
    lower.includes(
      "smpte 2084"
    )
  ) {

    meta.dynamicRange =
      "HDR10";

    meta.colorTransfer =
      "PQ";

  } else if (
    lower.includes(
      "arib-std-b67"
    ) ||
    lower.includes(
      "arib std b67"
    )
  ) {

    meta.dynamicRange =
      "HLG";

    meta.colorTransfer =
      "HLG";

  } else {

    meta.dynamicRange =
      "SDR";
  }


  if (
    lower.includes(
      "bt2020"
    )
  ) {

    meta.colorspace =
      "BT.2020";

  } else if (
    lower.includes(
      "bt709"
    )
  ) {

    meta.colorspace =
      "BT.709";
  }


  /* ----------------------------------------------------------
     AUDIO
  ---------------------------------------------------------- */

  const audioMatch =
    text.match(
      /Audio:\s*([^\s,(]+)/
    );

  if (audioMatch) {

    meta.audioPresent =
      true;

    meta.audioCodec =
      audioMatch[1];
  }


  /* ----------------------------------------------------------
     ROTATION
  ---------------------------------------------------------- */

  const rotationMatch =
    text.match(
      /rotate\s*:\s*(-?\d+)/
    );

  if (rotationMatch) {
    meta.rotation = Number(rotationMatch[1]);
  } else {
    const dmMatch = text.match(
      /displaymatrix:\s*rotation of\s*(-?[\d.]+)\s*degrees/i
    );
    if (dmMatch) {
      meta.rotation = Math.round(Number(dmMatch[1]));
    }
  }


  return meta;
}


/* ============================================================
   MEDIA UI
============================================================ */

function updateMediaUI(meta) {

  sourceMeta =
    meta;

  if (els.infoSize) {

    els.infoSize.textContent =
      formatBytes(
        selectedFile?.size
      );
  }

  if (els.infoDuration) {

    els.infoDuration.textContent =
      formatTime(
        meta.duration
      );
  }

  if (els.infoResolution) {

    els.infoResolution.textContent =
      meta.width &&
      meta.height
        ? `${meta.width}×${meta.height}`
        : "—";
  }

  if (els.infoFps) {

    els.infoFps.textContent =
      meta.fps
        ? meta.fps.toFixed(2)
        : "—";
  }

  if (els.infoDr) {

    els.infoDr.textContent =
      meta.dynamicRange;
  }

  if (els.infoRotation) {

    els.infoRotation.textContent =
      `${meta.rotation || 0}°`;
  }

  if (els.infoBitDepth) {

    els.infoBitDepth.textContent =
      `${meta.bitDepth}-bit`;
  }

  if (els.infoAudio) {

    els.infoAudio.textContent =
      meta.audioPresent
        ? `${String(
            meta.audioCodec ||
            "AAC"
          ).toUpperCase()} / present`
        : "None";
  }

  if (els.drBanner) {

    els.drBanner.textContent =
      `${meta.dynamicRange} · output ${getOutputPixFmt(meta) === "yuv420p10le" ? 10 : 8}-bit`;
  }

  if (els.previewSize) {

    els.previewSize.textContent =
      meta.width &&
      meta.height

        ? `${meta.width}×${meta.height} · ${
            meta.fps
              ? meta.fps.toFixed(2)
              : "—"
          } fps`

        : "—";
  }
}


/* ============================================================
   SCALE
============================================================ */

/* Display size after rotation metadata (phone videos often store 90° tags) */

function getDisplaySize(meta) {

  let w = Number(meta.width);
  let h = Number(meta.height);

  const rot =
    Math.abs(Number(meta.rotation) || 0) % 180;

  if (rot === 90) {
    [w, h] = [h, w];
  }

  return { w, h };
}


function getScaleArgs(meta) {

  const { w: width, h: height } =
    getDisplaySize(meta);

  const shortSide =
    Math.min(width, height);

  /* Never upscale */

  if (shortSide <= MAX_SHORT_SIDE) {
    return [];
  }

  /* Orientasi dibaca ffmpeg dari frame asli (setelah autorotate),
     jadi nggak tergantung parsing metadata rotasi.
     Portrait -> 1080x1920, Landscape -> 1920x1080 */
  return [
    "-vf",
    "scale='if(gt(iw,ih),-2,1080)':'if(gt(iw,ih),1080,-2)'"
  ];
}


/* Output bit depth follows the source: 10-bit stays 10-bit, 8-bit stays 8-bit.
   12-bit sources are written as 10-bit (libx264 High12 is rarely supported). */

function getOutputPixFmt(meta) {

  const bits = Number(meta?.bitDepth) || 8;

  return bits >= 10
    ? "yuv420p10le"
    : "yuv420p";
}


/* ============================================================
   BUILD FFMPEG COMMAND
============================================================ */

function buildRenderArgs() {

  const useMusic =
    Boolean(selectedMusic);

  const args = [

    "-hide_banner",

    "-i",
    INPUT_NAME
  ];

  /* MUSIC INPUT: loop terus, dipotong ikut durasi video (-shortest) */

  if (useMusic) {

    args.push(
      "-stream_loop",
      "-1",
      "-i",
      musicFsName
    );
  }

  args.push(
    "-map",
    "0:v:0"
  );

  /* AUDIO MAP: musik menggantikan audio asli sepenuhnya */

  if (useMusic) {

    args.push(
      "-map",
      "1:a:0"
    );

  } else if (
    sourceMeta?.audioPresent
  ) {

    args.push(
      "-map",
      "0:a:0"
    );
  }

  /* SCALE */

  args.push(
    ...getScaleArgs(
      sourceMeta
    )
  );

  /* VIDEO */

  const pixFmt =
    getOutputPixFmt(sourceMeta);

  args.push(
    "-c:v", "libx264",
    "-crf", String(currentCRF),
    "-preset", "veryfast",
    "-pix_fmt", pixFmt
  );

  /* 10-bit H.264 requires the High10 profile */

  if (pixFmt === "yuv420p10le") {
    args.push("-profile:v", "high10");
  }

  /*
    No forced colorspace/primaries/trc flags:
    color tags pass through from the source,
    so BT.2020 / HDR sources are not mis-tagged as BT.709.
  */

  /* AUDIO */

  if (useMusic) {

    const dur =
      Number(sourceMeta?.duration) || 0;

    /* volume dikunci di level asli musik (tanpa filter volume) */

    if (dur > 3) {

      args.push(
        "-af",
        `afade=t=out:st=${
          (dur - MUSIC_FADE_OUT).toFixed(2)
        }:d=${MUSIC_FADE_OUT}`
      );
    }

    args.push(
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "48000",
      "-ac", "2",
      "-shortest"
    );

  } else if (
    sourceMeta?.audioPresent
  ) {

    args.push(

      "-c:a",
      "aac",

      "-b:a",
      "128k"
    );
  }

  /* METADATA: buang metadata asli (termasuk lokasi GPS), tulis milik kita */

  args.push(

    "-map_metadata", "-1",

    "-metadata", `comment=${META_TEXT}`,
    "-metadata", `artist=${META_TEXT}`,
    "-metadata", `album_artist=${META_TEXT}`,
    "-metadata", `performer=${META_TEXT}`,
    "-metadata", `encoding_tool=${META_TEXT}`,
    "-metadata:s:v:0", `encoder=${META_TEXT}`
  );

  /* MP4 */

  args.push(

    "-movflags",
    "+faststart",

    OUTPUT_NAME
  );

  return args;
}


/* ============================================================
   MUSIC (opsional: ganti audio asli)
============================================================ */

function isMusicFile(file) {

  if (
    file?.type?.startsWith("audio/")
  ) {
    return true;
  }

  const ext =
    (file?.name?.split(".").pop() || "")
      .toLowerCase();

  return MUSIC_EXTS.includes(ext);
}

function updateMusicUI() {

  if (els.musicName) {

    els.musicName.textContent =
      selectedMusic
        ? `♪ ${selectedMusic.name}`
        : "Audio asli dipakai";

    els.musicName.classList.toggle(
      "on",
      Boolean(selectedMusic)
    );
  }

  if (els.musicClear) {

    els.musicClear.style.display =
      selectedMusic
        ? "inline"
        : "none";
  }
}

function selectMusic(file) {

  if (!file || isProcessing) {
    return;
  }

  if (!isMusicFile(file)) {

    alert(
      "Pilih file musik (mp3, m4a, wav, flac, ogg)."
    );

    return;
  }

  const rawExt =
    (file.name.split(".").pop() || "")
      .toLowerCase();

  const ext =
    /^[a-z0-9]{1,5}$/.test(rawExt)
      ? rawExt
      : "bin";

  musicFsName =
    `music.${ext}`;

  selectedMusic =
    file;

  updateMusicUI();
}

function clearMusic() {

  selectedMusic =
    null;

  if (els.musicInput) {
    els.musicInput.value =
      "";
  }

  updateMusicUI();
}

/* Hapus file sementara di memori ffmpeg.wasm (hemat RAM di HP) */

async function cleanupFS() {

  for (
    const name of [
      INPUT_NAME,
      OUTPUT_NAME,
      musicFsName,
      "final_probe.mp4"
    ]
  ) {

    try {
      await ffmpeg.deleteFile(name);
    } catch {}
  }
}

/* Probe sebuah Blob (dipakai buat baca info file hasil akhir) */

async function probeBlobFile(blob, fsName) {

  await loadFFmpeg();

  try {
    await ffmpeg.deleteFile(fsName);
  } catch {}

  await ffmpeg.writeFile(
    fsName,
    await fetchFile(blob)
  );

  const logs = [];

  const listener =
    ({ message }) => {
      logs.push(message);
    };

  ffmpeg.on("log", listener);

  try {

    await ffmpeg.exec([
      "-hide_banner",
      "-i",
      fsName,
      "-t",
      "0.001",
      "-map",
      "0:v:0?",
      "-f",
      "null",
      "-"
    ]);

  } catch {}

  if (typeof ffmpeg.off === "function") {
    ffmpeg.off("log", listener);
  }

  try {
    await ffmpeg.deleteFile(fsName);
  } catch {}

  const text =
    logs.join("\n");

  const meta =
    parseProbeText(text);

  meta.rawText =
    text;

  return meta;
}

/* ============================================================
   FILE SELECT
============================================================ */

async function selectFile(file) {

  if (!file) {
    return;
  }


  if (
    !file.type.startsWith(
      "video/"
    )
  ) {

    alert(
      "Please select a video file."
    );

    return;
  }


  if (isProcessing) {
    return;
  }


  selectedFile =
    file;

  renderedBlob =
    null;

  finalBlob =
    null;

  finalMeta =
    null;


  if (els.outputSection) {

    els.outputSection.style.display =
      "none";
  }


  if (els.selectedName) {

    els.selectedName.textContent =
      file.name;
  }


  if (els.previewName) {

    els.previewName.textContent =
      file.name;
  }


  /* SOURCE PREVIEW */

  if (
    els.sourceVideo?.src
  ) {

    try {
      URL.revokeObjectURL(
        els.sourceVideo.src
      );
    } catch {}
  }


  if (els.sourceVideo) {

    els.sourceVideo.src =
      URL.createObjectURL(
        file
      );
  }


  els.drop?.classList.remove(
    "empty"
  );

  els.drop?.classList.add(
    "has-video"
  );


  setProgress(0);


  if (els.elapsed) {
    els.elapsed.textContent =
      "00:00";
  }

  if (els.eta) {
    els.eta.textContent =
      "--:--";
  }


  clearLog();

  resetPipeline();


  /* meta lama jangan kepake kalau file baru belum selesai dibaca */

  sourceMeta =
    null;

  if (els.renderBtn) {
    els.renderBtn.disabled =
      true;
  }

  setStatus(
    "Preparing video…"
  );


  try {

    await loadFFmpeg();

    const meta =
      await probeVideo(
        file
      );

    updateMediaUI(
      meta
    );


    /*
      8-bit stable pipeline.
      We don't reject 10-bit here,
      but current engine outputs
      stable 8-bit.
    */

    log(
      `Detected: ${meta.width}x${meta.height}`
    );

    log(
      `Dynamic Range: ${meta.dynamicRange}`
    );

    log(
      `Bit Depth: ${meta.bitDepth}-bit`
    );


    setStatus(
      "Ready to render."
    );

    if (els.renderBtn) {
      els.renderBtn.disabled =
        false;
    }

  } catch (error) {

    console.error(
      error
    );

    setStatus(
      `Metadata error: ${error.message}`,
      true
    );

    log(
      `Metadata error: ${error.message}`
    );

    if (els.renderBtn) {
      els.renderBtn.disabled =
        false;
    }

    pipelineError(
      "render"
    );
  }
}


/* ============================================================
   CLEAR
============================================================ */

function clearAll() {

  if (isProcessing) {
    return;
  }


  selectedFile =
    null;

  renderedBlob =
    null;

  finalBlob =
    null;

  sourceMeta =
    null;

  finalMeta =
    null;


  if (els.fileInput) {
    els.fileInput.value =
      "";
  }


  try {
    els.sourceVideo?.pause();
  } catch {}


  if (
    els.sourceVideo?.src
  ) {

    try {
      URL.revokeObjectURL(
        els.sourceVideo.src
      );
    } catch {}
  }


  if (els.sourceVideo) {

    els.sourceVideo.removeAttribute(
      "src"
    );

    els.sourceVideo.load();
  }


  els.drop?.classList.remove(
    "has-video"
  );

  els.drop?.classList.add(
    "empty"
  );


  if (els.selectedName) {
    els.selectedName.textContent =
      "";
  }

  if (els.previewName) {
    els.previewName.textContent =
      "—";
  }

  if (els.previewSize) {
    els.previewSize.textContent =
      "—";
  }


  const infoFields = [

    els.infoSize,
    els.infoDuration,
    els.infoResolution,
    els.infoFps,
    els.infoDr,
    els.infoRotation,
    els.infoBitDepth,
    els.infoAudio
  ];


  infoFields.forEach(
    el => {

      if (el) {
        el.textContent =
          "—";
      }

    }
  );


  if (els.outputSection) {

    els.outputSection.style.display =
      "none";
  }


  setProgress(0);


  if (els.elapsed) {
    els.elapsed.textContent =
      "00:00";
  }

  if (els.eta) {
    els.eta.textContent =
      "--:--";
  }


  clearLog();

  clearMusic();

  setStatus(
    "Ready."
  );


  resetPipeline();


  if (els.patchBtn) {
    els.patchBtn.disabled =
      true;
  }
}


/* ============================================================
   RENDER
============================================================ */

async function render() {

  if (!selectedFile) {

    alert(
      "Choose a video first."
    );

    return;
  }

  if (!sourceMeta) {

    alert(
      "Info video belum terbaca. Tunggu sebentar atau pilih ulang videonya."
    );

    return;
  }


  if (isProcessing) {
    return;
  }


  isProcessing =
    true;

  if (els.musicBtn) {
    els.musicBtn.disabled =
      true;
  }


  if (els.renderBtn) {
    els.renderBtn.disabled =
      true;
  }

  if (els.patchBtn) {
    els.patchBtn.disabled =
      true;
  }


  try {

    clearLog();

    setProgress(0);

    if (els.elapsed) {
      els.elapsed.textContent =
        "00:00";
    }

    if (els.eta) {
      els.eta.textContent =
        "--:--";
    }


    resetPipeline();


    await loadFFmpeg();


    setStatus(
      "Preparing render…"
    );


    /* CLEAN */

    try {

      await ffmpeg.deleteFile(
        INPUT_NAME
      );

    } catch {}


    try {

      await ffmpeg.deleteFile(
        OUTPUT_NAME
      );

    } catch {}


    /* WRITE INPUT */

    await ffmpeg.writeFile(
      INPUT_NAME,
      await fetchFile(
        selectedFile
      )
    );


    /* WRITE MUSIC (opsional) */

    try {
      await ffmpeg.deleteFile(
        musicFsName
      );
    } catch {}

    if (selectedMusic) {

      await ffmpeg.writeFile(
        musicFsName,
        await fetchFile(
          selectedMusic
        )
      );
    }

    /* COMMAND */

    const args =
      buildRenderArgs();


    log(
      `Input: ${selectedFile.name}`
    );


    if (sourceMeta) {

      log(
        `Source: ${sourceMeta.width}x${sourceMeta.height}`
      );

      log(
        `FPS: ${
          sourceMeta.fps
            ? sourceMeta.fps.toFixed(2)
            : "—"
        }`
      );

      log(
        `Dynamic Range: ${sourceMeta.dynamicRange}`
      );

      log(
        `Bit Depth: ${sourceMeta.bitDepth}-bit`
      );

      log(
        `Audio: ${
          sourceMeta.audioPresent
            ? "present"
            : "none"
        }`
      );
    }


    const scale =
      getScaleArgs(
        sourceMeta
      );


    log(
      scale.length
        ? `Scale: ${scale[1]}`
        : "Scale: no resize"
    );


    log(
      `CRF: ${currentCRF}`
    );


    log(
      "Preset: veryfast"
    );


    log(
      `Pixel format: ${getOutputPixFmt(sourceMeta)}`
    );


    log(
      "Output color: source (pass-through)"
    );

    log(
      selectedMusic
        ? `Audio output: diganti musik "${selectedMusic.name}" (ikut durasi video)`
        : "Audio output: asli"
    );

    log(
      `Metadata: ${META_TEXT}`
    );


    log("");

    log(
      `ffmpeg ${args.join(" ")}`
    );

    log("");


    /* RENDER */

    startTimer();


    setStatus(
      "Rendering…"
    );


    const exitCode =
      await ffmpeg.exec(
        args
      );


    stopTimer();


    if (
      exitCode !== 0
    ) {

      throw new Error(
        selectedMusic
          ? `FFmpeg exit code ${exitCode}. Cek file musiknya (format tidak terbaca atau tidak ada audio).`
          : `FFmpeg exit code ${exitCode}`
      );
    }


    /* READ OUTPUT */

    const data =
      await ffmpeg.readFile(
        OUTPUT_NAME
      );


    renderedBlob =
      new Blob(
        [data.buffer],
        {
          type:
            "video/mp4"
        }
      );


    setProgress(100);


    if (els.eta) {
      els.eta.textContent =
        "00:00";
    }


    log("");

    log(
      `Render complete: ${formatBytes(
        renderedBlob.size
      )}`
    );

    log(
      "Intermediate render was not downloaded."
    );


    setStatus(
      "Render complete. Starting patch…"
    );


    renderPipelineDone();


    /*
      AUTO PATCH
    */

    await patchWithCompressBase();


  } catch (error) {

    stopTimer();

    console.error(
      error
    );


    pipelineError(
      "render"
    );


    setStatus(
      `Error: ${error.message}`,
      true
    );


    log("");

    log(
      `ERROR: ${error.message}`
    );


  } finally {

    await cleanupFS();

    if (els.musicBtn) {
      els.musicBtn.disabled =
        false;
    }

    isProcessing =
      false;


    if (els.renderBtn) {
      els.renderBtn.disabled =
        false;
    }
  }
}


/* ============================================================
   COMPRESSBASE PATCH
============================================================ */

async function patchWithCompressBase() {

  if (!renderedBlob) {

    alert(
      "Render the video first."
    );

    return;
  }


  try {

    if (els.patchBtn) {
      els.patchBtn.disabled =
        true;
    }


    patchPipelineStart();


    if (els.patchStatus) {

      els.patchStatus.textContent =
        "Loading CompressBase…";
    }


    setStatus(
      "Loading CompressBase…"
    );


    log(
      "Loading CompressBase patch engine…"
    );


    /*
      Dynamic import allows the main
      app to remain static/local.
    */

    const module =
      await import(
        COMPRESSBASE_URL
      );


    const patchVideo =
      module.patchVideo ||
      module.default?.patchVideo;


    if (
      typeof patchVideo !==
      "function"
    ) {

      throw new Error(
        "CompressBase patchVideo() was not found."
      );
    }


    if (els.patchStatus) {

      els.patchStatus.textContent =
        "Patching video…";
    }


    setStatus(
      "Patching video…"
    );


    log(
      "Patch variant: variant-3"
    );


    const patchInput =
      new File(
        [renderedBlob],
        "rendered.mp4",
        {
          type:
            "video/mp4"
        }
      );


    const result =
      await patchVideo(

        patchInput,

        {

          postingDevice:
            PATCH_VARIANT,

          onStatus(status) {

            if (!status) {
              return;
            }


            const text =
              String(status);


            if (els.patchStatus) {
              els.patchStatus.textContent =
                text;
            }


            setStatus(
              text
            );


            log(
              `Patch: ${text}`
            );
          }
        }
      );


    /* RESULT */

    if (
      result instanceof Blob
    ) {

      finalBlob =
        result;

    } else if (
      result?.blob instanceof Blob
    ) {

      finalBlob =
        result.blob;

    } else if (
      result?.file instanceof Blob
    ) {

      finalBlob =
        result.file;

    } else {

      throw new Error(
        "CompressBase returned an unknown result."
      );
    }


    if (!finalBlob) {

      throw new Error(
        "Final patched video is empty."
      );
    }


    log("");

    log(
      `Patch complete: ${formatBytes(
        finalBlob.size
      )}`
    );


    patchPipelineDone();


    /*
      Probe final patched file
      so result panel can show
      useful information.
    */

    await updateFinalInfo();


    if (els.patchStatus) {

      els.patchStatus.textContent =
        `Patch complete · ${formatBytes(
          finalBlob.size
        )}`;
    }


    setStatus(
      "Patch complete. Downloading final video…"
    );


    /*
      AUTO DOWNLOAD
    */

    downloadFinal();


    pipelineComplete();


    setStatus(
      "Done. Final video downloaded."
    );


    if (els.patchStatus) {

      els.patchStatus.textContent =
        `Done · ${formatBytes(
          finalBlob.size
        )}`;
    }


  } catch (error) {

    console.error(
      error
    );


    pipelineError(
      "patch"
    );


    if (els.patchStatus) {

      els.patchStatus.textContent =
        `Patch error: ${error.message}`;
    }


    setStatus(
      `Patch failed: ${error.message}`,
      true
    );


    log("");

    log(
      `PATCH ERROR: ${error.message}`
    );


  } finally {

    if (els.patchBtn) {

      /*
        Keep manual button available
        after processing for re-patching
        only when final result exists.
      */

      els.patchBtn.disabled =
        !renderedBlob;
    }
  }
}


/* ============================================================
   PATCH PIPELINE START
============================================================ */

function patchPipelineStart() {

  els.pipeRender?.classList.remove(
    "active"
  );

  els.pipePatch?.classList.remove(
    "done",
    "error"
  );

  els.pipePatch?.classList.add(
    "active"
  );

  els.pipeDone?.classList.remove(
    "active",
    "done",
    "error"
  );
}


/* ============================================================
   UPDATE FINAL INFO
============================================================ */

async function updateFinalInfo() {

  if (!finalBlob) {
    return;
  }


  const duration =
    sourceMeta?.duration ||
    0;


  /*
    Since final Blob comes from
    CompressBase, use source
    geometry/FPS as the fallback.
  */

  /* Baca info dari file hasil akhir (bukan dari video sumber) */

  let outProbe = null;

  try {

    outProbe =
      await probeBlobFile(
        finalBlob,
        "final_probe.mp4"
      );

  } catch (err) {

    console.warn(
      "Final probe failed:",
      err
    );
  }

  const outSize =
    outProbe?.width && outProbe?.height
      ? getDisplaySize(outProbe)
      : null;

  finalMeta = {
    width:
      outSize ? outSize.w : 0,
    height:
      outSize ? outSize.h : 0,
    fps:
      outProbe?.fps ||
      sourceMeta?.fps ||
      0,
    bitDepth:
      outProbe?.bitDepth ||
      0,
    duration,
    bitrate:
      calculateBitrate(
        finalBlob.size,
        duration
      )
  };

  if (outProbe?.rawText) {

    log(
      `Final: ${
        finalMeta.width
      }x${
        finalMeta.height
      } · ${
        finalMeta.bitDepth
      }-bit`
    );

    log(
      outProbe.rawText.includes("@totolat")
        ? `Metadata: ${META_TEXT} ✓`
        : "Metadata: tag @totolat tidak ditemukan di file akhir (mungkin ditulis ulang oleh patch)"
    );
  }


  /*
    Optional final info IDs.
    The app still works if
    these IDs don't exist.
  */

  const finalSize =
    $("final-size");

  const finalResolution =
    $("final-resolution");

  const finalFps =
    $("final-fps");

  const finalBitrate =
    $("final-bitrate");


  if (finalSize) {

    finalSize.textContent =
      formatBytes(
        finalBlob.size
      );
  }


  if (finalResolution) {

    finalResolution.textContent =
      finalMeta.width &&
      finalMeta.height

        ? `${finalMeta.width}×${finalMeta.height}`

        : "—";
  }


  if (finalFps) {

    finalFps.textContent =
      finalMeta.fps

        ? finalMeta.fps.toFixed(2)

        : "—";
  }


  if (finalBitrate) {

    finalBitrate.textContent =
      formatBitrate(
        finalMeta.bitrate
      );
  }


  /*
    Old output-info element:
    keep it compatible if it
    still exists in index.html.
  */

  if (els.outputInfo) {

    els.outputInfo.textContent =
      `${formatBytes(
        finalBlob.size
      )} · ${
        finalMeta.width &&
        finalMeta.height
          ? `${finalMeta.width}×${finalMeta.height}`
          : "—"
      } · ${
        finalMeta.fps
          ? finalMeta.fps.toFixed(2)
          : "—"
      } fps · ${
        formatBitrate(
          finalMeta.bitrate
        )
      }${
        finalMeta.bitDepth
          ? ` · ${finalMeta.bitDepth}-bit`
          : ""
      }`;
  }


  if (els.outputSection) {

    els.outputSection.style.display =
      "block";
  }


  /*
    IMPORTANT:
    no final video preview.
  */

  if (els.preview) {

    try {

      els.preview.pause();

    } catch {}


    els.preview.removeAttribute(
      "src"
    );

    try {
      els.preview.load();
    } catch {}
  }
}


/* ============================================================
   DOWNLOAD
============================================================ */

function downloadFinal() {

  if (!finalBlob) {

    alert(
      "Patch the video first."
    );

    return;
  }


  const base =
    selectedFile

      ? selectedFile.name.replace(
          /\.[^.]+$/,
          ""
        )

      : "video";


  const filename =
    `${base}_totolat.mp4`;


  const url =
    URL.createObjectURL(
      finalBlob
    );


  const a =
    document.createElement(
      "a"
    );


  a.href =
    url;

  a.download =
    filename;


  document.body.appendChild(
    a
  );


  a.click();

  a.remove();


  setTimeout(
    () => {

      URL.revokeObjectURL(
        url
      );

    },
    1500
  );
}


/* ============================================================
   COPY LOG
============================================================ */

async function copyLog() {

  if (!els.log) {
    return;
  }


  const text =
    els.log.textContent;


  if (!text) {
    return;
  }


  try {

    await navigator.clipboard.writeText(
      text
    );


    const old =
      els.copyLog?.textContent ||
      "COPY";


    if (els.copyLog) {

      els.copyLog.textContent =
        "COPIED ✓";
    }


    setTimeout(
      () => {

        if (els.copyLog) {

          els.copyLog.textContent =
            old;
        }

      },
      1400
    );


  } catch {

    alert(
      "Copy failed."
    );
  }
}


/* ============================================================
   CRF
============================================================ */

els.crfButtons?.forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        currentCRF =
          Number(
            button.dataset.crf
          );


        els.crfButtons.forEach(
          btn => {

            btn.classList.remove(
              "active"
            );
          }
        );


        button.classList.add(
          "active"
        );


        if (els.encoderCrf) {

          els.encoderCrf.textContent =
            currentCRF;
        }
      }
    );
  }
);


/*
  Make CRF 24 the default
  even if HTML doesn't mark
  the correct button.
*/

(function initCRF() {

  const defaultButton =
    document.querySelector(
      '[data-crf="24"]'
    );

  if (!defaultButton) {
    return;
  }


  currentCRF =
    24;


  els.crfButtons?.forEach(
    btn => {

      btn.classList.toggle(
        "active",
        btn === defaultButton
      );
    }
  );


  if (els.encoderCrf) {

    els.encoderCrf.textContent =
      "24";
  }

})();


/* ============================================================
   FILE INPUT
============================================================ */

els.drop?.addEventListener(
  "click",
  event => {

    /*
      Don't open picker when
      interacting with video.
    */

    if (
      event.target.closest(
        "video"
      )
    ) {
      return;
    }


    if (
      event.target.closest(
        "button"
      )
    ) {
      return;
    }


    els.fileInput?.click();
  }
);


els.fileInput?.addEventListener(
  "change",
  () => {

    const file =
      els.fileInput.files?.[0];


    if (file) {

      selectFile(
        file
      );
    }
  }
);


/* ============================================================
   DRAG & DROP
============================================================ */

els.drop?.addEventListener(
  "dragover",
  event => {

    event.preventDefault();

    els.drop.style.borderColor =
      "#32d899";
  }
);


els.drop?.addEventListener(
  "dragleave",
  () => {

    els.drop.style.borderColor =
      "";
  }
);


els.drop?.addEventListener(
  "drop",
  event => {

    event.preventDefault();

    els.drop.style.borderColor =
      "";


    const file =
      event.dataTransfer
        ?.files?.[0];


    if (file) {

      selectFile(
        file
      );
    }
  }
);


/* ============================================================
   BUTTONS
============================================================ */

els.renderBtn?.addEventListener(
  "click",
  render
);


els.patchBtn?.addEventListener(
  "click",
  async () => {

    /*
      Manual patch is only a
      backup. Normal flow already
      patches automatically.
    */

    if (
      !isProcessing &&
      renderedBlob
    ) {

      await patchWithCompressBase();
    }
  }
);


els.clearBtn?.addEventListener(
  "click",
  clearAll
);


els.clearInline?.addEventListener(
  "click",
  event => {

    event.stopPropagation();

    clearAll();
  }
);


els.copyLog?.addEventListener(
  "click",
  copyLog
);


els.downloadBtn?.addEventListener(
  "click",
  downloadFinal
);


/* ============================================================
   MUSIC BUTTON
============================================================ */

els.musicBtn?.addEventListener(
  "click",
  () => {

    if (isProcessing) {
      return;
    }

    els.musicInput?.click();
  }
);

els.musicInput?.addEventListener(
  "change",
  () => {

    const file =
      els.musicInput.files?.[0];

    if (file) {
      selectMusic(file);
    }

    els.musicInput.value =
      "";
  }
);

els.musicClear?.addEventListener(
  "click",
  () => {

    if (isProcessing) {
      return;
    }

    clearMusic();
  }
);

/* ============================================================
   PREVIEW MODAL
============================================================ */

function ensurePreviewModal() {

  if (
    document.getElementById(
      "rb-preview-modal"
    )
  ) {

    return document.getElementById(
      "rb-preview-modal"
    );
  }


  const modal =
    document.createElement(
      "div"
    );


  modal.id =
    "rb-preview-modal";


  modal.innerHTML = `

    <div class="rb-modal-backdrop"></div>

    <div class="rb-modal-panel rb-video-modal">

      <button
        type="button"
        class="rb-modal-close"
        aria-label="Close"
      >×</button>

      <video
        id="rb-modal-video"
        controls
        playsinline
        preload="metadata"
      ></video>

    </div>
  `;


  document.body.appendChild(
    modal
  );


  injectModalCSS();


  const backdrop =
    modal.querySelector(
      ".rb-modal-backdrop"
    );

  const close =
    modal.querySelector(
      ".rb-modal-close"
    );


  const closeModal =
    () => {

      const video =
        modal.querySelector(
          "#rb-modal-video"
        );

      try {
        video.pause();
      } catch {}

      modal.classList.remove(
        "show"
      );
    };


  backdrop?.addEventListener(
    "click",
    closeModal
  );

  close?.addEventListener(
    "click",
    closeModal
  );


  return modal;
}


function openPreviewModal() {

  if (
    !els.sourceVideo?.src
  ) {
    return;
  }


  const modal =
    ensurePreviewModal();


  const modalVideo =
    modal.querySelector(
      "#rb-modal-video"
    );


  modalVideo.src =
    els.sourceVideo.src;


  modal.classList.add(
    "show"
  );
}


/* ============================================================
   TUTORIAL MODAL
============================================================ */

/* ============================================================
   MODAL HELPERS
============================================================ */

function createModal(id, title, bodyHTML) {

  const existing =
    document.getElementById(id);

  if (existing) {
    return existing;
  }

  const modal =
    document.createElement("div");

  modal.id = id;

  modal.innerHTML = `

    <div class="rb-modal-backdrop"></div>

    <div class="rb-modal-panel">

      <button
        type="button"
        class="rb-modal-close"
        aria-label="Close"
      >×</button>

      <div class="rb-modal-title">
        ${title}
      </div>

      <div
        class="rb-modal-content"
        data-role="body"
      >
        ${bodyHTML}
      </div>

    </div>
  `;

  document.body.appendChild(modal);

  injectModalCSS();

  const closeModal = () => {
    modal.classList.remove("show");
  };

  modal
    .querySelector(".rb-modal-close")
    ?.addEventListener("click", closeModal);

  modal
    .querySelector(".rb-modal-backdrop")
    ?.addEventListener("click", closeModal);

  return modal;
}


/* Fetch an HTML fragment (e.g. patch.html) into the modal body */

async function loadModalFragment(modal, url) {

  const body =
    modal.querySelector('[data-role="body"]');

  if (!body) return;

  if (
    body.dataset.src === url &&
    body.dataset.state === "ok"
  ) {
    return;
  }

  body.dataset.src = url;
  body.dataset.state = "loading";

  body.innerHTML =
    `<p class="rb-muted">Memuat…</p>`;

  try {

    const res =
      await fetch(url, {
        cache: "no-cache"
      });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    body.innerHTML =
      await res.text();

    body.dataset.state = "ok";

  } catch (err) {

    console.error(
      `Gagal memuat ${url}:`,
      err
    );

    body.dataset.state = "error";

    body.innerHTML = `
      <p>
        Gagal memuat <code>${url}</code>.
        Pastikan file ada di folder yang sama
        dengan app ini dan app dibuka lewat
        server (bukan file://).
      </p>
    `;
  }
}


/* Fetch the embedded QRIS image into a slot inside the modal */

async function loadModalImage(modal, url, alt) {

  const slot =
    modal.querySelector('[data-role="image"]');

  if (!slot) return;

  if (slot.dataset.state === "ok") return;

  slot.innerHTML =
    `<p class="rb-muted">Memuat gambar…</p>`;

  try {

    const res =
      await fetch(url, {
        cache: "no-cache"
      });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const blob =
      await res.blob();

    const img =
      new Image();

    img.alt = alt;

    img.src =
      URL.createObjectURL(blob);

    img.style.cssText =
      "display:block;max-width:100%;" +
      "margin:0 auto 14px;border-radius:12px;";

    slot.innerHTML = "";
    slot.appendChild(img);

    slot.dataset.state = "ok";

  } catch (err) {

    console.error(
      `Gagal memuat ${url}:`,
      err
    );

    slot.dataset.state = "error";

    slot.innerHTML = `
      <p>
        Gagal memuat <code>${url}</code>.
      </p>
    `;
  }
}


/* ============================================================
   TUTORIAL MODAL  (content: tutorial.html)
============================================================ */

const TUTORIAL_URL = "./tutorial.html";

function ensureTutorialModal() {

  return createModal(
    "rb-tutorial-modal",
    "RENDER BYTE",
    ""
  );
}


function openTutorial() {

  const modal =
    ensureTutorialModal();

  modal.classList.add("show");

  loadModalFragment(
    modal,
    TUTORIAL_URL
  );
}


/* ============================================================
   PATCH INFO MODAL  (content: patch.html)
============================================================ */

const PATCH_URL = "./patch.html";

/* Tombol PATCH sekarang pindah ke halaman sendiri (folder patch/) */
const PATCH_PAGE = "./patch/patch.html";

function goPatchPage() {
  window.location.href = PATCH_PAGE;
}

function ensurePatchModal() {

  return createModal(
    "rb-patch-modal",
    "HIGH QUALITY METHOD",
    ""
  );
}


function openPatch() {

  const modal =
    ensurePatchModal();

  modal.classList.add("show");

  loadModalFragment(
    modal,
    PATCH_URL
  );
}


/* ============================================================
   SUPPORT MODAL  (embedded QRIS image)
============================================================ */

const QRIS_URL = window.QRIS_DATA;

function ensureSupportModal() {

  return createModal(
    "rb-support-modal",
    "SUPPORT",
    `
      <div data-role="image"></div>

      <p>
        Support / development
      </p>

      <p class="rb-muted">
        If Render Byte helps your workflow,
        you can support the project through
        the official High Quality Method page.
      </p>

      <a
        class="rb-modal-link"
        href="https://sain-byte.github.io/method/"
        target="_blank"
        rel="noopener"
      >
        OPEN SUPPORT PAGE →
      </a>

      <div class="rb-support-note">
        Support helps keep Render Byte running,
        cover project costs, and save for future
        running shoes. Thank you for supporting
        the project. 🫶
      </div>
    `
  );
}


function openSupport() {

  const modal =
    ensureSupportModal();

  modal.classList.add("show");

  loadModalImage(
    modal,
    QRIS_URL,
    "QRIS"
  );
}


/* ============================================================
   MODAL CSS
============================================================ */

function injectModalCSS() {

  if (
    document.getElementById(
      "rb-modal-css"
    )
  ) {

    return;
  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "rb-modal-css";


  style.textContent = `

    .rb-modal-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0,0,0,.72);
      backdrop-filter: blur(8px);
    }

    .show > .rb-modal-backdrop {
      display: block;
    }

    .rb-modal-panel {
      position: fixed;
      left: 50%;
      top: 50%;
      width: min(560px, calc(100vw - 28px));
      max-height: min(760px, calc(100vh - 28px));
      overflow: auto;
      transform: translate(-50%, -48%) scale(.97);
      opacity: 0;
      pointer-events: none;
      transition:
        opacity .18s ease,
        transform .18s ease;
      z-index: 1001;
      background:
        linear-gradient(
          145deg,
          rgba(19,27,24,.98),
          rgba(9,13,12,.98)
        );
      border: 1px solid rgba(50,216,153,.35);
      border-radius: 18px;
      box-shadow:
        0 25px 90px rgba(0,0,0,.55),
        0 0 35px rgba(50,216,153,.08);
      padding: 22px;
      color: #eaf5ef;
    }

    .show > .rb-modal-panel,
    .rb-modal-panel.show {
      opacity: 1;
      transform:
        translate(-50%, -50%) scale(1);
      pointer-events: auto;
    }

    .rb-modal-close {
      position: absolute;
      top: 10px;
      right: 12px;
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 10px;
      background: rgba(255,255,255,.06);
      color: #dce8e2;
      font-size: 22px;
      cursor: pointer;
    }

    .rb-modal-close:hover {
      background: rgba(50,216,153,.12);
    }

    .rb-modal-title {
      font-weight: 800;
      letter-spacing: .08em;
      margin-bottom: 18px;
      color: #32d899;
    }

    .rb-modal-content {
      font-size: 14px;
      line-height: 1.65;
    }

    .rb-modal-content p {
      margin: 0 0 12px;
    }

    .rb-modal-content hr {
      border: 0;
      border-top: 1px solid rgba(255,255,255,.08);
      margin: 20px 0;
    }

    .rb-lang-title {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .12em;
      color: #32d899;
      margin-bottom: 10px;
    }

    .rb-modal-link {
      display: inline-flex;
      margin: 10px 0 16px;
      padding: 10px 13px;
      border-radius: 10px;
      background: rgba(50,216,153,.10);
      border: 1px solid rgba(50,216,153,.25);
      color: #32d899;
      text-decoration: none;
      font-weight: 700;
      font-size: 12px;
    }

    .rb-modal-link:hover {
      background: rgba(50,216,153,.16);
    }

    .rb-muted {
      opacity: .68;
    }

    .rb-support-note {
      margin-top: 20px;
      padding-top: 14px;
      border-top: 1px solid rgba(255,255,255,.08);
      color: #32d899;
      font-weight: 700;
    }

    .rb-video-modal {
      width: min(900px, calc(100vw - 20px));
      padding: 10px;
      background: #050706;
    }

    .rb-video-modal video {
      display: block;
      width: 100%;
      max-height: calc(100vh - 70px);
      object-fit: contain;
      border-radius: 12px;
      background: #000;
    }

  `;


  document.head.appendChild(
    style
  );
}


/* ============================================================
   PREVIEW CLICK
============================================================ */

els.inputPreview?.addEventListener(
  "click",
  event => {

    /*
      Don't trigger modal when
      user clicks controls.
    */

    if (
      event.target.closest(
        "video"
      )
    ) {

      /*
        On mobile/browser,
        clicking the video itself
        should open player only when
        the preview container is clicked.
      */
    }

    openPreviewModal();
  }
);


/*
  Also support clicking the
  actual source video.
*/

els.sourceVideo?.addEventListener(
  "dblclick",
  () => {

    openPreviewModal();
  }
);


/* ============================================================
   HEADER BUTTONS
============================================================ */

els.tutorialBtn?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    openTutorial();
  }
);


els.supportBtn?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    openSupport();
  }
);


/*
  PATCH header button may use
  id="btn-patch-header".
*/

const patchHeaderBtn =
  $("btn-patch-header");


patchHeaderBtn?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    goPatchPage();
  }
);


/*
  Some layouts may use
  id="btn-patch-top".
*/

const patchTopBtn =
  $("btn-patch-top");


patchTopBtn?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    goPatchPage();
  }
);


/* ============================================================
   ESCAPE TO CLOSE MODALS
============================================================ */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key !==
      "Escape"
    ) {
      return;
    }


    document
      .querySelectorAll(
        ".rb-modal-panel.show"
      )
      .forEach(
        panel => {

          const parent =
            panel.closest(
              "[id^='rb-'][id$='modal']"
            );

          parent?.classList.remove(
            "show"
          );
        }
      );
  }
);


/* ============================================================
   INITIAL STATE
============================================================ */

setProgress(0);


if (els.status) {

  els.status.textContent =
    "Ready.";
}


if (els.patchBtn) {

  els.patchBtn.disabled =
    true;
}


if (els.outputSection) {

  els.outputSection.style.display =
    "none";
}


resetPipeline();


/* ============================================================
   LOCAL PROCESSING INDICATOR
============================================================ */

(function initLocalIndicator() {

  const candidates = [

    $("local-processing"),
    $("local-status"),
    document.querySelector(
      "[data-local-processing]"
    )
  ];


  const element =
    candidates.find(
      Boolean
    );


  if (!element) {
    return;
  }


  element.textContent =
    "LOCAL PROCESSING · NO UPLOAD";
})();


/* ============================================================
   PAGE VISIBILITY
============================================================ */

document.addEventListener(
  "visibilitychange",
  () => {

    /*
      Don't stop FFmpeg when
      user temporarily switches
      tabs/apps.

      Browser may throttle it,
      but FFmpeg state remains.
    */
  }
);


/* ============================================================
   DEBUG
============================================================ */

window.RenderByte = {

  render,

  patch:
    patchWithCompressBase,

  download:
    downloadFinal,

  clear:
    clearAll,

  getState() {

    return {

      selectedFile:
        selectedFile?.name ||
        null,

      sourceMeta,

      currentCRF,

      rendered:
        Boolean(
          renderedBlob
        ),

      final:
        Boolean(
          finalBlob
        ),

      processing:
        isProcessing
    };
  }

};


console.log(
  "Render Byte V1 ready."
);