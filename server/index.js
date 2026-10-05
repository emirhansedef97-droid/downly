import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { spawn } from 'node:child_process';
import { mkdir, rm, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BODY = '50kb';

const YTDLP = process.env.YTDLP_PATH || '/usr/local/bin/yt-dlp';
const YTDLP_BASE = [];

// Render Secret File
const YOUTUBE_COOKIES = '/etc/secrets/youtube_cookies.txt';

app.use(cors());
app.use(express.json({ limit: MAX_BODY }));
app.use(morgan('tiny'));
app.use(express.static(path.join(__dirname, '..', 'public')));

const ALLOWED = [
/(^|.)instagram.com$/i,
/(^|.)x.com$/i,
/(^|.)twitter.com$/i,
/(^|.)tiktok.com$/i,
/(^|.)facebook.com$/i,
/(^|.)youtube.com$/i,
/(^|.)youtu.be$/i
];

function platformFor(url) {
const h = url.hostname.toLowerCase();

if (h === 'instagram.com' || h.endsWith('.instagram.com')) {
return 'instagram';
}

if (
h === 'x.com' ||
h.endsWith('.x.com') ||
h === 'twitter.com' ||
h.endsWith('.twitter.com')
) {
return 'x';
}

if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) {
return 'tiktok';
}

if (h === 'facebook.com' || h.endsWith('.facebook.com')) {
return 'facebook';
}

if (
h === 'youtube.com' ||
h.endsWith('.youtube.com') ||
h === 'youtu.be'
) {
return 'youtube';
}

return 'social';
}

function validateUrl(raw) {
let u;

try {
u = new URL(String(raw).trim());
} catch {
throw new Error('Geçerli bir URL girin.');
}

if (!['https:', 'http:'].includes(u.protocol)) {
throw new Error('Yalnızca HTTP/HTTPS bağlantıları desteklenir.');
}

if (!ALLOWED.some(re => re.test(u.hostname))) {
throw new Error('Bu platform henüz desteklenmiyor.');
}

if (platformFor(u) === 'instagram') {
u.search = '';
u.hash = '';
}

return u.toString();
}

/*

YouTube dışındaki platformlara DOKUNMUYORUZ.

Sadece YouTube için cookie ve alternatif player client kullanılıyor.
*/
function buildYtdlpArgs(args, platform) {
if (platform === 'youtube') {
return [
...YTDLP_BASE,
'--cookies',
YOUTUBE_COOKIES,
'--extractor-args',
'youtube:player_client=web_embedded,web_safari,ios',
...args
];
}

return [...YTDLP_BASE, ...args];
}

function runYtdlp(args, platform) {
return new Promise((resolve, reject) => {
const p = spawn(
YTDLP,
buildYtdlpArgs(args, platform),
{
stdio: ['ignore', 'pipe', 'pipe']
}
);

let out = '';
let err = '';

p.stdout.on('data', d => {
  out += d;
});

p.stderr.on('data', d => {
  err += d;
});

p.on('error', error => {
  console.error('YT-DLP SPAWN ERROR:', error);

  reject(
    new Error('yt-dlp çalıştırılamadı.')
  );
});

p.on('close', code => {
  if (code === 0) {
    resolve(out);
  } else {
    console.error('YT-DLP ERROR:', err);

    reject(
      new Error(
        cleanError(err) ||
        'İçerik alınamadı.'
      )
    );
  }
});

});
}

function cleanError(err) {
const s = String(err);

if (
/impersonate target|no impersonate target/i.test(s)
) {
return 'yt-dlp bağlantı bileşeni eksik.';
}

if (
/login required|rate-limit|not available|empty media response/i.test(s)
) {
return 'İçeriğe şu anda erişilemiyor. İçerik herkese açık olmalı ve platform erişimi engellememiş olmalı.';
}

if (
/sign in to confirm|not a bot|confirm you.?re not a bot/i.test(s)
) {
return 'YouTube bu sunucunun isteğini bot doğrulamasına taktı.';
}

if (/unsupported url/i.test(s)) {
return 'Bu bağlantı türü desteklenmiyor.';
}

return s
.split('\n')
.map(x => x.trim())
.filter(Boolean)
.slice(-3)
.join(' ');
}

function normalizeFormats(info) {
const map = new Map();

for (const f of info.formats || []) {
if (!f.url) continue;
if (f.vcodec === 'none' || f.acodec === 'none') continue;

const height = Number(f.height || 0);

if (!height) continue;

const key = `${height}-${f.ext || 'mp4'}`;

if (!map.has(key)) {
  map.set(key, {
    format_id: f.format_id,
    height,
    ext: f.ext || 'mp4',
    filesize: f.filesize || f.filesize_approx || null,
    label: `${height}p · ${f.ext || 'mp4'}`
  });
}

}

return [...map.values()]
.sort((a, b) => b.height - a.height)
.slice(0, 8);
}

async function createBrowserPreview(url, platform, tmpDir, format) {
const sourceTemplate = path.join(
tmpDir,
'source.%(ext)s'
);

const outputFile = path.join(
tmpDir,
'preview.mp4'
);

const selector =
format === 'best'
? 'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc1]/best[ext=mp4]/best'
: ${format}+bestaudio[ext=m4a]/${format}/best[ext=mp4][vcodec^=avc1]/best[ext=mp4]/best;

await new Promise((resolve, reject) => {
const args = [
'--no-playlist',
'--no-warnings',
'-f',
selector,
'-o',
sourceTemplate,
url
];

const p = spawn(
  YTDLP,
  buildYtdlpArgs(args, platform),
  {
    stdio: ['ignore', 'ignore', 'pipe']
  }
);

let err = '';

p.stderr.on('data', d => {
  err += d;
});

p.on('error', error => {
  console.error(
    'PREVIEW YT-DLP SPAWN ERROR:',
    error
  );

  reject(
    new Error('yt-dlp bulunamadı.')
  );
});

p.on('close', code => {
  if (code === 0) {
    resolve();
  } else {
    console.error(
      'PREVIEW YT-DLP ERROR:',
      err
    );

    reject(
      new Error(
        cleanError(err) ||
        'Önizleme kaynağı oluşturulamadı.'
      )
    );
  }
});

});

const files = await readdir(tmpDir);

const source = files.find(file => {
return (
/^source./i.test(file) &&
/.(mp4|webm|mov|mkv|m4v)$/i.test(file)
);
});

if (!source) {
throw new Error(
'Önizleme için video kaynağı oluşturulamadı.'
);
}

const sourceFile = path.join(
tmpDir,
source
);

await new Promise((resolve, reject) => {
const args = [
'-y',
'-i',
sourceFile,

  '-map',
  '0:v:0',
  '-map',
  '0:a:0?',

  '-c:v',
  'libx264',

  '-preset',
  'veryfast',

  '-crf',
  '23',

  '-pix_fmt',
  'yuv420p',

  '-c:a',
  'aac',

  '-b:a',
  '128k',

  '-movflags',
  '+faststart',

  outputFile
];

console.log(
  'FFMPEG PREVIEW:',
  args.join(' ')
);

const p = spawn(
  'ffmpeg',
  args,
  {
    stdio: ['ignore', 'ignore', 'pipe']
  }
);

let err = '';

p.stderr.on('data', d => {
  err += d;
});

p.on('error', error => {
  console.error(
    'FFMPEG SPAWN ERROR:',
    error
  );

  reject(
    new Error(
      'ffmpeg çalıştırılamadı.'
    )
  );
});

p.on('close', code => {
  if (code === 0) {
    resolve();
  } else {
    console.error(
      'FFMPEG ERROR:',
      err
    );

    reject(
      new Error(
        'Video web oynatımı için dönüştürülemedi.'
      )
    );
  }
});

});

return outputFile;
}

app.get('/api/health', (_req, res) => {
res.json({
ok: true,
service: 'downly',
version: '2.1.0'
});
});

app.post('/api/analyze', async (req, res) => {
try {
const url = validateUrl(
req.body?.url || ''
);

const platform = platformFor(
  new URL(url)
);

const raw = await runYtdlp(
  [
    '--dump-single-json',
    '--no-playlist',
    '--skip-download',
    '--no-warnings',
    url
  ],
  platform
);

const info = JSON.parse(raw);

res.json({
  ok: true,
  platform:
    info.extractor_key ||
    info.extractor ||
    platform,

  title:
    info.title ||
    'İçerik',

  thumbnail:
    info.thumbnail ||
    null,

  duration:
    info.duration ||
    null,

  formats:
    normalizeFormats(info)
});

} catch (e) {
console.error(
'ANALYZE ERROR:',
e
);

res.status(400).json({
  ok: false,
  error: e.message
});

}
});

app.get('/api/media', async (req, res) => {
let tmpDir;

try {
const url = validateUrl(
req.query.url || ''
);

const parsed = new URL(url);

const platform = platformFor(
  parsed
);

const format = String(
  req.query.format || 'best'
);

if (
  !/^[A-Za-z0-9+\-_.]+$/.test(format)
) {
  throw new Error(
    'Geçersiz format.'
  );
}

tmpDir = path.join(
  '/tmp',
  `downly-preview-${crypto.randomUUID()}`
);

await mkdir(
  tmpDir,
  {
    recursive: true
  }
);

const previewFile =
  await createBrowserPreview(
    url,
    platform,
    tmpDir,
    format
  );

const info =
  await stat(previewFile);

res.setHeader(
  'Content-Length',
  info.size
);

res.setHeader(
  'Content-Type',
  'video/mp4'
);

res.setHeader(
  'Content-Disposition',
  'inline; filename="downly-preview.mp4"'
);

res.setHeader(
  'Accept-Ranges',
  'bytes'
);

res.sendFile(
  previewFile,
  async () => {
    await rm(
      tmpDir,
      {
        recursive: true,
        force: true
      }
    ).catch(() => {});
  }
);

} catch (e) {
console.error(
'MEDIA ERROR:',
e
);

if (tmpDir) {
  await rm(
    tmpDir,
    {
      recursive: true,
      force: true
    }
  ).catch(() => {});
}

if (!res.headersSent) {
  res.status(400).json({
    ok: false,
    error: e.message
  });
}

}
});

app.get('/api/download', async (req, res) => {
let tmpDir;

try {
const url = validateUrl(
req.query.url || ''
);

const parsed = new URL(url);

const platform = platformFor(
  parsed
);

const format = String(
  req.query.format || 'best'
);

if (
  !/^[A-Za-z0-9+\-_.]+$/.test(format)
) {
  throw new Error(
    'Geçersiz format.'
  );
}

tmpDir = path.join(
  '/tmp',
  `downly-${crypto.randomUUID()}`
);

await mkdir(
  tmpDir,
  {
    recursive: true
  }
);

const template = path.join(
  tmpDir,
  'downly.%(ext)s'
);

const selector =
  format === 'best'
    ? 'best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]/best'
    : `${format}/best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]/best`;

await new Promise(
  (resolve, reject) => {
    const args = [
      '--no-playlist',
      '--no-warnings',
      '-f',
      selector,
      '-o',
      template,
      url
    ];

    const p = spawn(
      YTDLP,
      buildYtdlpArgs(
        args,
        platform
      ),
      {
        stdio: [
          'ignore',
          'ignore',
          'pipe'
        ]
      }
    );

    let err = '';

    p.stderr.on(
      'data',
      d => {
        err += d;
      }
    );

    p.on(
      'error',
      () => {
        reject(
          new Error(
            'yt-dlp bulunamadı.'
          )
        );
      }
    );

    p.on(
      'close',
      code => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              cleanError(err) ||
              'İçerik indirilemedi.'
            )
          );
        }
      }
    );

    req.on(
      'close',
      () => {
        if (!res.headersSent) {
          p.kill('SIGTERM');
        }
      }
    );
  }
);

const files =
  await readdir(tmpDir);

const media =
  files.find(
    f =>
      /\.(mp4|webm|m4a|mov|jpg|jpeg|png|webp)$/i.test(
        f
      )
  );

if (!media) {
  throw new Error(
    'İndirilebilir medya dosyası oluşturulamadı.'
  );
}

const file =
  path.join(
    tmpDir,
    media
  );

const info =
  await stat(file);

const ext =
  path
    .extname(media)
    .slice(1)
    .toLowerCase() ||
  'mp4';

let mime =
  'application/octet-stream';

if (ext === 'mp4') {
  mime = 'video/mp4';
} else if (ext === 'webm') {
  mime = 'video/webm';
} else if (ext === 'm4a') {
  mime = 'audio/mp4';
} else if (ext === 'mov') {
  mime = 'video/quicktime';
} else if (
  ext === 'jpg' ||
  ext === 'jpeg'
) {
  mime = 'image/jpeg';
} else if (ext === 'png') {
  mime = 'image/png';
} else if (ext === 'webp') {
  mime = 'image/webp';
}

res.setHeader(
  'Content-Length',
  info.size
);

res.setHeader(
  'Content-Type',
  mime
);

res.setHeader(
  'Content-Disposition',
  `attachment; filename="downly.${ext}"`
);

res.sendFile(
  file,
  async () => {
    await rm(
      tmpDir,
      {
        recursive: true,
        force: true
      }
    ).catch(() => {});
  }
);

} catch (e) {
console.error(
'DOWNLOAD ERROR:',
e
);

if (tmpDir) {
  await rm(
    tmpDir,
    {
      recursive: true,
      force: true
    }
  ).catch(() => {});
}

if (!res.headersSent) {
  res.status(400).json({
    ok: false,
    error: e.message
  });
}

}
});

app.use(
(_req, res) => {
res.sendFile(
path.join(
__dirname,
'..',
'public',
'index.html'
)
);
}
);

app.listen(
PORT,
() => {
console.log(
Downly çalışıyor: http://localhost:${PORT}
);
}
);
