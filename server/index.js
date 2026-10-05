import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const YTDLP = process.env.YTDLP_PATH || '/usr/local/bin/yt-dlp';

app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(morgan('tiny'));
app.use(express.static(path.join(__dirname, '..', 'public')));

function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(YTDLP, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    p.stdout.on('data', d => {
      stdout += d.toString();
    });

    p.stderr.on('data', d => {
      stderr += d.toString();
    });

    p.on('error', err => {
      reject(new Error(`yt-dlp çalıştırılamadı: ${err.message}`));
    });

    p.on('close', code => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `yt-dlp exit code: ${code}`));
      }
    });
  });
}

function cleanError(error) {
  const s = String(error?.message || error);

  if (/sign in to confirm|not a bot|confirm you.?re not a bot/i.test(s)) {
    return 'YOUTUBE_BOT_CHECK';
  }

  if (/login required/i.test(s)) {
    return 'YOUTUBE_LOGIN_REQUIRED';
  }

  if (/private video/i.test(s)) {
    return 'YOUTUBE_PRIVATE';
  }

  if (/video unavailable|unavailable/i.test(s)) {
    return 'YOUTUBE_UNAVAILABLE';
  }

  if (/unsupported url/i.test(s)) {
    return 'UNSUPPORTED_URL';
  }

  return s
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)
    .slice(-5)
    .join(' ');
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'downly',
    diagnostic: true
  });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const rawUrl = String(req.body?.url || '').trim();

    let url;

    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error('Geçerli bir URL girin.');
    }

    const host = url.hostname.toLowerCase();

    if (
      host !== 'youtube.com' &&
      !host.endsWith('.youtube.com') &&
      host !== 'youtu.be'
    ) {
      throw new Error('Bu teşhis sürümü yalnızca YouTube içindir.');
    }

    console.log('YOUTUBE DIAGNOSTIC: Cookie kullanılmadan test başlıyor.');
    console.log('YOUTUBE DIAGNOSTIC: URL:', url.toString());

    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--skip-download',
      '--no-warnings',
      '--no-cache-dir',
      '--extractor-args',
      'youtube:player_client=web_embedded,web_safari,ios',
      url.toString()
    ];

    console.log(
      'YOUTUBE DIAGNOSTIC: yt-dlp başlatılıyor.'
    );

    const raw = await runYtdlp(args);
    const info = JSON.parse(raw);

    console.log(
      'YOUTUBE DIAGNOSTIC: BAŞARILI.'
    );

    res.json({
      ok: true,
      diagnostic: true,
      youtube: true,
      cookieUsed: false,
      title: info.title || 'İçerik',
      extractor:
        info.extractor_key ||
        info.extractor ||
        null,
      duration: info.duration || null,
      message: 'YouTube erişimi cookie olmadan başarılı.'
    });
  } catch (error) {
    const rawMessage = String(
      error?.message || error
    );

    console.error(
      'YOUTUBE DIAGNOSTIC ERROR:',
      rawMessage
    );

    const reason = cleanError(error);

    res.status(400).json({
      ok: false,
      diagnostic: true,
      youtube: true,
      cookieUsed: false,
      reason,
      error: reason === 'YOUTUBE_BOT_CHECK'
        ? 'YouTube Render sunucusunun isteğini bot doğrulamasına taktı.'
        : reason
    });
  }
});

app.use((_req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '..',
      'public',
      'index.html'
    )
  );
});

app.listen(PORT, () => {
  console.log(
    `Downly diagnostic çalışıyor: http://localhost:${PORT}`
  );
});
