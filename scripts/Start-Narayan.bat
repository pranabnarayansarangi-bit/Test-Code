@echo off
REM ============================================================
REM  Narayan — one-double-click setup & start for Windows
REM  Save this file to your Desktop and double-click it.
REM  It clones the code, installs, asks for your 2 secrets,
REM  builds, and starts Narayan (then shows the WhatsApp QR).
REM  Safe to run again any time — it just updates and restarts.
REM ============================================================
setlocal enableextensions

set "APPDIR=%USERPROFILE%\Narayan"
set "REPO=%APPDIR%\test-code"
set "BRANCH=claude/whatsapp-narayan-integration-r04ufj"
set "GITURL=https://github.com/pranabnarayansarangi-bit/test-code.git"

title Narayan setup
echo.
echo ============================================================
echo   NARAYAN - WhatsApp Executive Assistant
echo ============================================================
echo.

REM --- 1. Check Node.js -----------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js is not installed.
  echo     Please install the LTS version from https://nodejs.org
  echo     then double-click this file again.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node --version') do echo [ok] Node.js %%v found.

REM --- 2. Check Git ---------------------------------------------
where git >nul 2>nul
if errorlevel 1 (
  echo [!] Git is not installed.
  echo     Please install it from https://git-scm.com/download/win
  echo     then double-click this file again.
  echo.
  pause
  exit /b 1
)
echo [ok] Git found.
echo.

REM --- 3. Clone or update the code ------------------------------
if not exist "%APPDIR%" mkdir "%APPDIR%"
if exist "%REPO%\.git" (
  echo [..] Updating existing code in %REPO%
  cd /d "%REPO%"
  git fetch origin %BRANCH%
  git checkout %BRANCH%
  git pull origin %BRANCH%
) else (
  echo [..] Downloading the code into %REPO%
  git clone "%GITURL%" "%REPO%"
  cd /d "%REPO%"
  git checkout %BRANCH%
)
echo.

REM --- 4. Seed config files from the examples -------------------
if not exist ".env" copy /y ".env.example" ".env" >nul
if not exist "config.json" copy /y "config.example.json" "config.json" >nul
if not exist "knowledge.md" copy /y "knowledge.example.md" "knowledge.md" >nul

REM --- 5. Ask for the two secrets (chat id is already known) ----
echo ============================================================
echo   Enter your two secrets (they are saved locally only).
echo ============================================================
echo.
set "ANTHROPIC_API_KEY="
set "TELEGRAM_BOT_TOKEN="
set /p ANTHROPIC_API_KEY=Paste your Anthropic API key (sk-ant-...):
set /p TELEGRAM_BOT_TOKEN=Paste your Telegram bot token (from BotFather):

REM Write .env fresh with the three values.
> ".env" echo ANTHROPIC_API_KEY=%ANTHROPIC_API_KEY%
>> ".env" echo CLASSIFY_MODEL=claude-sonnet-4-6
>> ".env" echo DRAFT_MODEL=claude-opus-4-8
>> ".env" echo CLASSIFY_EFFORT=medium
>> ".env" echo DRAFT_EFFORT=xhigh
>> ".env" echo BRIEF_EFFORT=xhigh
>> ".env" echo TELEGRAM_BOT_TOKEN=%TELEGRAM_BOT_TOKEN%
>> ".env" echo TELEGRAM_CHAT_ID=5173453221
>> ".env" echo AUTH_DIR=./auth_state
>> ".env" echo DB_PATH=./data/narayan.db
>> ".env" echo CONFIG_PATH=./config.json
>> ".env" echo KNOWLEDGE_PATH=./knowledge.md
echo.
echo [ok] Secrets saved to .env
echo.

REM --- 6. Install dependencies + build -------------------------
echo [..] Installing dependencies (first time can take a few minutes)...
call npm install
if errorlevel 1 (
  echo [!] npm install failed. Scroll up to see the error.
  pause
  exit /b 1
)
echo [..] Building...
call npm run build
if errorlevel 1 (
  echo [!] Build failed. Scroll up to see the error.
  pause
  exit /b 1
)
echo.

REM --- 7. Start Narayan ----------------------------------------
echo ============================================================
echo   Starting Narayan. A QR code will appear below.
echo   On your phone:  WhatsApp  ->  Settings  ->  Linked Devices
echo   ->  Link a Device  ->  scan the QR.
echo   Keep this window OPEN to keep Narayan running.
echo ============================================================
echo.
call npm start

echo.
echo Narayan has stopped. Press any key to close.
pause >nul
endlocal
