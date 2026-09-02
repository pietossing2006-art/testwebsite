@echo off
title VxperS Launcher
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher.ps1"
pause
