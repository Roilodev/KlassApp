@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo No se encontro .env. Copia .env.example como .env y configura AUTH_SECRET.
  pause
  exit /b 1
)

echo Iniciando la API y la interfaz...
start "KlassApp API" /D "%CD%" cmd /k "npm.cmd run dev:api"
start "KlassApp Web" /D "%CD%" cmd /k "npm.cmd run dev:web"
start "" "http://localhost:3001"

echo Listo. Interfaz: http://localhost:3001 - API: http://localhost:4000
exit /b 0
