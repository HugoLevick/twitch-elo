@echo off
setlocal enabledelayedexpansion
cd %~dp0

del "C:\Program Files\twitch-elo\.env"
del "C:\Program Files\twitch-elo\options.json"
del ".env"

echo Settings have been reset
pause