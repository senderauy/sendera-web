@echo off
set "PATH=%ProgramFiles%\nodejs\;%APPDATA%\npm;%PATH%"
npx vercel dev --listen %1 --yes
