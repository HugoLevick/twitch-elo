@echo off
sc config MySQL80 start= demand
net start MySQL80
cd %~dp0
call npm i --omit-dev
call npm i @nestjs/cli
call npm run build
set /p choice= "Installation complete, press enter to continue"