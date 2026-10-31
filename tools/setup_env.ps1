# Windows PowerShell equivalent of tools/setup_env.sh
#   powershell -ExecutionPolicy Bypass -File tools\setup_env.ps1
if (Test-Path .env) {
    Write-Host ".env already exists - not touching it" -ForegroundColor Yellow
    exit 0
}
Copy-Item .env.example .env
Write-Host "created .env from .env.example" -ForegroundColor Green
Write-Host "now edit .env and set LLM_PROVIDER=groq + GROQ_API_KEY=... (never commit it)"
Write-Host "opening it in Notepad..."
Start-Process notepad .env
