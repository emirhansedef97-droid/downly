@echo off
setlocal
cd /d "%~dp0"
echo Downly kurulumu basliyor...
where python >nul 2>nul
if errorlevel 1 (
  echo Python bulunamadi. Python 3.10+ kurup tekrar deneyin.
  pause
  exit /b 1
)
python -m pip install --upgrade yt-dlp curl-cffi
if errorlevel 1 (
  echo Python paketleri kurulurken hata olustu.
  pause
  exit /b 1
)
echo.
echo Kurulum tamamlandi.
echo Simdi npm install ve npm start komutlarini calistirabilirsiniz.
pause
