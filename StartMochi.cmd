@echo off
rem Start Mochi desktop pet (dev build)
cd /d E:\AI\projects\deskPet
start "" "C:\Program Files\nodejs\node.exe" launcher.js --disable-gpu --no-sandbox --in-process-gpu
