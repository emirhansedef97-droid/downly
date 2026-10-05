const $ = s => document.querySelector(s);

const player = $('#player');
const previewBtn = $('#previewBtn');

const form = $('#form');
const url = $('#url');
const status = $('#status');
const result = $('#result');
const thumb = $('#thumb');
const noThumb = $('#noThumb');
const platform = $('#platform');
const title = $('#title');
const format = $('#format');
const download = $('#download');

const progressWrap = $('#progressWrap');
const progressBar = $('#progressBar');
const progressText = $('#progressText');

let data = null;

const historyKey = 'downly-history-v1';

function getHistory() {
  try {
    return JSON.parse(
      localStorage.getItem(historyKey) || '[]'
    );
  } catch {
    return [];
  }
}

function saveHistory(item) {
  const h = [
    item,
    ...getHistory().filter(x => x.url !== item.url)
  ].slice(0, 8);

  localStorage.setItem(
    historyKey,
    JSON.stringify(h)
  );

  renderHistory();
}

function renderHistory() {
  const list = $('#historyList');
  const h = getHistory();

  if (!h.length) {
    $('#history').classList.add('hidden');
    return;
  }

  $('#history').classList.remove('hidden');

  list.innerHTML = h.map((x, i) => `
    <div class="history-item">
      <div class="history-meta">
        <strong>${escapeHtml(x.title || x.url)}</strong>
        <span>${escapeHtml(x.platform || 'Bağlantı')}</span>
      </div>
      <button data-history="${i}">
        Tekrar analiz et
      </button>
    </div>
  `).join('');

  list
    .querySelectorAll('[data-history]')
    .forEach(b => {
      b.onclick = () => {
        const x = h[Number(b.dataset.history)];

        url.value = x.url;

        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });

        form.requestSubmit();
      };
    });
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>'"]/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[c])
  );
}

function bytes(n) {
  if (!n) return '';

  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;

  while (n >= 1024 && i < 3) {
    n /= 1024;
    i++;
  }

  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function duration(s) {
  if (!s) return '';

  s = Math.round(s);

  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');

  return `${m}:${sec}`;
}

form.addEventListener('submit', async e => {
  e.preventDefault();

  const value = url.value.trim();

  if (!value) return;

  status.textContent = 'İçerik analiz ediliyor…';

  result.classList.add('hidden');

  $('#analyzeBtn').disabled = true;

  try {
    const r = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: value
      })
    });

    const j = await r.json();

    if (!r.ok || !j.ok) {
      throw new Error(
        j.error || 'Analiz başarısız.'
      );
    }

    data = {
      ...j,
      url: value
    };

    render();

    saveHistory({
      url: value,
      title: j.title,
      platform: j.platform
    });

    status.textContent =
      'Hazır. İndirmek istediğin kaliteyi seç.';
  } catch (err) {
    status.textContent =
      err.message || 'Bir hata oluştu.';
  } finally {
    $('#analyzeBtn').disabled = false;
  }
});

function render() {
  platform.textContent = data.platform;

  title.textContent =
    data.title || 'İçerik';

  if (data.thumbnail) {
    thumb.src = data.thumbnail;
    thumb.style.display = 'block';
    noThumb.style.display = 'none';
  } else {
    thumb.removeAttribute('src');
    thumb.style.display = 'none';
    noThumb.style.display = 'block';
  }

  player.removeAttribute('src');
  player.load();
  player.style.display = 'none';

  $('#duration').textContent =
    duration(data.duration);

  /*
   * KALİTE SEÇENEKLERİ
   *
   * Sunucudan gelen formatlar burada
   * select kutusuna eklenir.
   */
  format.innerHTML = '';

  const fs = data.formats || [];

  const options = fs.length
    ? fs
    : [
        {
          format_id: 'best',
          label: 'En iyi kalite · MP4',
          ext: 'mp4'
        }
      ];

  options.forEach(f => {
    const o = document.createElement('option');

    o.value = f.format_id;

    o.textContent =
      `${f.label}${f.filesize ? ' · ' + bytes(f.filesize) : ''}`;

    format.appendChild(o);
  });

  result.classList.remove('hidden');

  result.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });

  progressWrap.classList.add('hidden');
}

format.addEventListener('change', () => {
  if (player && player.style.display !== 'none') {
    player.pause();
    player.removeAttribute('src');
    player.load();
  }
});

if (previewBtn) {
  previewBtn.addEventListener('click', () => {
    if (!data) return;

    const selected =
      format.value || 'best';

    player.src =
      `/api/media?url=${encodeURIComponent(data.url)}&format=${encodeURIComponent(selected)}`;

    player.style.display = 'block';

    player.play().catch(() => {});

    status.textContent =
      'Video tarayıcı içinde hazırlandı.';
  });
}

$('#clear').onclick = () => {
  result.classList.add('hidden');

  status.textContent = '';

  if (player) {
    player.pause();
    player.removeAttribute('src');
    player.load();
  }

  url.focus();
};

$('#clearHistory').onclick = () => {
  localStorage.removeItem(historyKey);

  renderHistory();
};

async function downloadFile() {
  if (!data) return;

  /*
   * Kullanıcının seçtiği kalite.
   * Örneğin: 1080p format_id, 720p format_id vb.
   */
  const selected =
    format.value || 'best';

  download.disabled = true;

  progressWrap.classList.remove('hidden');

  progressBar.style.width = '0%';

  progressText.textContent = '0%';

  try {
    const res = await fetch(
      `/api/download?url=${encodeURIComponent(data.url)}&format=${encodeURIComponent(selected)}`
    );

    if (!res.ok) {
      let msg = 'İndirme başarısız.';

      try {
        const j = await res.json();
        msg = j.error || msg;
      } catch {}

      throw new Error(msg);
    }

    const total =
      Number(
        res.headers.get('content-length')
      ) || 0;

    const reader =
      res.body.getReader();

    let received = 0;

    const chunks = [];

    while (true) {
      const {
        done,
        value
      } = await reader.read();

      if (done) break;

      chunks.push(value);

      received += value.byteLength;

      if (total) {
        const pct = Math.min(
          100,
          Math.round(
            received / total * 100
          )
        );

        progressBar.style.width =
          pct + '%';

        progressText.textContent =
          pct + '%';
      }
    }

    const blob = new Blob(
      chunks,
      {
        type:
          res.headers.get('content-type') ||
          'application/octet-stream'
      }
    );

    const a =
      document.createElement('a');

    const blobUrl =
      URL.createObjectURL(blob);

    a.href = blobUrl;
    a.download = 'downly';

    document.body.appendChild(a);

    a.click();

    a.remove();

    URL.revokeObjectURL(blobUrl);

    progressBar.style.width = '100%';

    progressText.textContent =
      'Tamamlandı';

    status.textContent =
      'İndirme tamamlandı.';
  } catch (err) {
    status.textContent =
      err.message ||
      'İndirme başarısız.';

    progressWrap.classList.add('hidden');
  } finally {
    download.disabled = false;
  }
}

download.addEventListener(
  'click',
  downloadFile
);

/*
 * GECE MODU
 *
 * Site varsayılan olarak gece modunda açılır.
 * Kullanıcı açık temaya geçmediyse gece modu kullanılır.
 */

const themeButton = $('#theme');

if (themeButton) {
  themeButton.onclick = () => {
    document.body.classList.toggle('dark');

    const dark =
      document.body.classList.contains('dark');

    themeButton.textContent =
      dark ? '☀' : '☾';

    localStorage.setItem(
      'downly-theme',
      dark ? 'dark' : 'light'
    );
  };

  if (
    localStorage.getItem('downly-theme') !== 'light'
  ) {
    document.body.classList.add('dark');
    themeButton.textContent = '☀';
  }
}

renderHistory();
