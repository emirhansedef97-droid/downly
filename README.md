# Downly 2.1

Sade ve responsive sosyal medya medya indirici MVP'si.

## Desteklenen platformlar

- Instagram (Reels / herkese açık postlar; erişim Instagram tarafından engellenmiyorsa)
- TikTok
- X / Twitter
- Facebook
- YouTube

## Windows'ta kurulum

1. Node.js LTS kurulu olsun.
2. `setup.bat` dosyasına çift tıklayın. Bu dosya `yt-dlp` ve Instagram için gereken `curl-cffi` paketini kurar.
3. Terminali Downly klasöründe açın:

```text
npm install
npm start
```

4. Tarayıcıda `http://localhost:3000` açın.

### Neden setup.bat?

Instagram extractor'ı zaman zaman giriş, rate-limit veya istemci parmak izi değişikliklerinden etkilenebilir. Güncel yt-dlp sürümü ve curl-cffi/impersonation desteği bu durumların bir kısmını çözer. Uygulama sabit bir User-Agent zorlamaz.

## Önemli

- Yalnızca herkese açık veya indirme hakkına sahip olduğunuz içerikleri indirin.
- Uygulama Instagram hesap şifresi istemez.
- Özel hesap, paywall veya erişim kontrolünü aşmaya yönelik özellik eklenmemiştir.
- Instagram yine de bazı içerikleri geçici olarak erişilemez yapabilir.
