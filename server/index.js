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

// Prefer the Python module so Windows installations are reliable even when
// the yt-dlp executable is not on PATH. Set YTDLP_PATH to override.
const YTDLP = process.env.YTDLP_PATH || '/usr/local/bin/yt-dlp';
const YTDLP_BASE = [];


app.use(cors());
app.use(express.json({ limit: MAX_BODY }));
app.use(morgan('tiny'));
app.use(express.static(path.join(__dirname, '..', 'public')));

const ALLOWED = [
  /(^|\.)instagram\.com$/i, /(^|\.)x\.com$/i, /(^|\.)twitter\.com$/i,
  /(^|\.)tiktok\.com$/i, /(^|\.)facebook\.com$/i,
  /(^|\.)youtube\.com$/i, /(^|\.)youtu\.be$/i
];

function platformFor(url) {
  const h = url.hostname.toLowerCase();
  if (h === 'instagram.com' || h.endsWith('.instagram.com')) return 'instagram';
  if (h === 'x.com' || h.endsWith('.x.com') || h === 'twitter.com' || h.endsWith('.twitter.com')) return 'x';
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return 'tiktok';
  if (h === 'facebook.com' || h.endsWith('.facebook.com')) return 'facebook';
  if (h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtu.be') return 'youtube';
  return 'social';
}

function validateUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw new Error('Geçerli bir URL girin.'); }
  if (!['https:', 'http:'].includes(u.protocol)) throw new Error('Yalnızca HTTP/HTTPS bağlantıları desteklenir.');
  if (!ALLOWED.some(re => re.test(u.hostname))) throw new Error('Bu platform henüz desteklenmiyor.');

  // Tracking/share parameters are not needed by the extractors and can make
  // debugging harder. Keep only the actual content path.
  if (platformFor(u) === 'instagram') {
    u.search = '';
    u.hash = '';
  }
  return u.toString();
}

function buildYtdlpArgs(args, platform) {
  const base = [...YTDLP_BASE];
  return [...base, ...args];
}

function runYtdlp(args, platform) {
  return new Promise((resolve, reject) => {
    const p = spawn(YTDLP, buildYtdlpArgs(args, platform), {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let out = '';
    let err = '';

    p.stdout.on('data', d => {
      out += d;
    });

    p.stderr.on('data', d => {
      err += d;
    });

    p.on('error', () => {
      reject(new Error('yt-dlp bulunamadı.'));
    });

    p.on('close', code => {
      if (code === 0) {
        resolve(out);
      } else {
        console.error('YT-DLP ERROR:', err);
        reject(new Error(cleanError(err) || 'İçerik alınamadı.'));
      }
    });
  });
}

  return new Promise((resolve, reject) => {
    const p = spawn(YTDLP, buildYtdlpArgs(args, platform), {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let out = '', err = '';

    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);

    p.on('error', () => {
      reject(new Error('yt-dlp bulunamadı. Önce setup.bat dosyasını çalıştırın.'));
    });

    p.on('close', code => {
      if (code === 0) {
        resolve(out);
      } else {
        console.error('YT-DLP ERROR:', err);
        reject(new Error(cleanError(err) || 'İçerik alınamadı.'));
      }
    });
  });
}

function cleanError(err) {
  const s = String(err);
  if (/no impersonate target|impersonate target is available/i.test(s)) {
    return 'Instagram için gerekli bağlantı bileşeni eksik. setup.bat dosyasını çalıştırıp tekrar deneyin.';
  }
  if (/login required|rate-limit|not available|empty media response/i.test(s)) {
    return 'Instagram içeriğine şu anda erişilemiyor. İçerik herkese açık olmalı ve Instagram erişimi engellememiş olmalı.';
  }
  if (/unsupported url/i.test(s)) return 'Bu bağlantı türü desteklenmiyor.';
  return s.split('\n').map(x => x.trim()).filter(Boolean).slice(-3).join(' ');
}

function normalizeFormats(info) {
  const map = new Map();
  for (const f of info.formats || []) {
    if (!f.url || f.vcodec === 'none' || f.acodec === 'none') continue;
    const height = Number(f.height || 0);
    if (!height) continue;
    const key = `${height}-${f.ext || 'mp4'}`;
    if (!map.has(key)) map.set(key, {
      format_id: f.format_id,
      height,
      ext: f.ext || 'mp4',
      filesize: f.filesize || f.filesize_approx || null,
      label: `${height}p · ${f.ext || 'mp4'}`
    });
  }
  return [...map.values()].sort((a, b) => b.height - a.height).slice(0, 8);
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'downly', version: '2.1.0' }));

app.post('/api/analyze', async (req, res) => {
  try {
    const url = validateUrl(req.body?.url || '');
    const platform = platformFor(new URL(url));
    const raw = await runYtdlp(['--dump-single-json', '--no-playlist', '--skip-download', '--no-warnings', url], platform);
    const info = JSON.parse(raw);
    res.json({
      ok: true,
      platform: info.extractor_key || info.extractor || platform,
      title: info.title || 'İçerik',
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      formats: normalizeFormats(info)
    });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.get('/api/media', async (req, res) => {
  let tmpDir;
  try {
    const url = validateUrl(req.query.url || '');
    const parsed = new URL(url);
    const platform = platformFor(parsed);
    const format = String(req.query.format || 'best');
    if (!/^[A-Za-z0-9+\-_.]+$/.test(format)) throw new Error('Geçersiz format.');
    tmpDir = path.join('/tmp', `downly-preview-${crypto.randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
    const template = path.join(tmpDir, 'preview.%(ext)s');
    const selector = format === 'best'
      ? 'best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]/best'
      : `${format}/best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]/best`;

    await new Promise((resolve, reject) => {
      const args = ['--no-playlist', '--no-warnings', '-f', selector, '-o', template, url];
      const p = spawn(YTDLP, buildYtdlpArgs(args, platform), { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', d => err += d);
      p.on('error', () => reject(new Error('yt-dlp bulunamadı.')));
      p.on('close', code => code === 0 ? resolve() : reject(new Error(cleanError(err) || 'Önizleme oluşturulamadı.')));
      req.on('close', () => { if (!res.headersSent) p.kill('SIGTERM'); });
    });

    const files = await readdir(tmpDir);
    const media = files.find(f => /\.(mp4|webm|mov)$/i.test(f));
    if (!media) throw new Error('Tarayıcıda oynatılabilir video oluşturulamadı.');
    const file = path.join(tmpDir, media);
    const info = await stat(file);
    const ext = path.extname(media).slice(1).toLowerCase();
    const mime = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : 'video/quicktime';
    res.setHeader('Content-Length', info.size);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="downly-preview.${ext}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.sendFile(file, async () => { await rm(tmpDir, { recursive: true, force: true }).catch(() => {}); });
  } catch (e) {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (!res.headersSent) res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/download', async (req, res) => {
  let tmpDir;
  try {
    const url = validateUrl(req.query.url || '');
    const parsed = new URL(url);
    const platform = platformFor(parsed);
    const format = String(req.query.format || 'best');
    if (!/^[A-Za-z0-9+\-_.]+$/.test(format)) throw new Error('Geçersiz format.');
    tmpDir = path.join('/tmp', `downly-${crypto.randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
    const template = path.join(tmpDir, 'downly.%(ext)s');
    const selector = format === 'best'
      ? 'best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]/best'
      : `${format}/best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]/best`;

    await new Promise((resolve, reject) => {
      const args = ['--no-playlist', '--no-warnings', '-f', selector,
        '-o', template, url];
      const p = spawn(YTDLP, buildYtdlpArgs(args, platform), { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', d => err += d);
      p.on('error', () => reject(new Error('yt-dlp bulunamadı.')));
      p.on('close', code => code === 0 ? resolve() : reject(new Error(cleanError(err) || 'İçerik indirilemedi.')));
      req.on('close', () => { if (!res.headersSent) p.kill('SIGTERM'); });
    });

    const files = await readdir(tmpDir);
    const media = files.find(f => /\.(mp4|webm|m4a|mov|jpg|jpeg|png|webp)$/i.test(f));
    if (!media) throw new Error('İndirilebilir medya dosyası oluşturulamadı.');
    const file = path.join(tmpDir, media);
    const info = await stat(file);
    const ext = path.extname(media).slice(1).toLowerCase() || 'mp4';
    const mime = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : ext.startsWith('jp') ? 'image/jpeg' : 'application/octet-stream';
    res.setHeader('Content-Length', info.size);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="downly.${ext}"`);
    res.sendFile(file, async () => { await rm(tmpDir, { recursive: true, force: true }).catch(() => {}); });
  } catch (e) {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (!res.headersSent) res.status(400).json({ ok: false, error: e.message });
  }
});

app.use((_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.listen(PORT, () => console.log(`Downly çalışıyor: http://localhost:${PORT}`));
