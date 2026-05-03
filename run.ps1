#!/usr/bin/env pwsh
# run.ps1 — Windows replacement for Makefile
# Usage: .\run.ps1 up | down | test | logs | status

param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

$ProjectRoot = $PSScriptRoot

switch ($Command) {

    "up" {
        Write-Host "🚀 Starting Ring of the Middle Earth..." -ForegroundColor Cyan
        docker compose -f "$ProjectRoot\docker-compose.yml" up --build -d
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✅ System started!" -ForegroundColor Green
            Write-Host "   🌍 Open http://localhost in two browser tabs" -ForegroundColor Yellow
            Write-Host "   One tab = Light Side, other tab = Dark Side" -ForegroundColor Yellow
        }
    }

    "down" {
        Write-Host "🛑 Stopping all services..." -ForegroundColor Yellow
        docker compose -f "$ProjectRoot\docker-compose.yml" down
    }

    "test" {
        Write-Host "🧪 Running unit tests..." -ForegroundColor Cyan
        Push-Location "$ProjectRoot\option-b"
        go test ./tests/... -v
        Pop-Location
    }

    "test-race" {
        Write-Host "🧪 Running unit tests with race detector (requires CGO)..." -ForegroundColor Cyan
        Push-Location "$ProjectRoot\option-b"
        go test ./tests/... -v -race
        Pop-Location
    }

    "build" {
        Write-Host "🔨 Building Go binary..." -ForegroundColor Cyan
        Push-Location "$ProjectRoot\option-b"
        go build -o server.exe ./main.go
        Pop-Location
        Write-Host "✅ Binary: option-b\server.exe" -ForegroundColor Green
    }

    "run-local" {
        Write-Host "▶️ Running locally (no Docker, no Kafka)..." -ForegroundColor Cyan
        Write-Host "   Open http://localhost:8080" -ForegroundColor Yellow
        Push-Location "$ProjectRoot\option-b"
        $env:CONFIG_DIR = "$ProjectRoot\config"
        $env:PORT = "8080"
        go run ./main.go
        Pop-Location
    }

    "logs" {
        docker compose -f "$ProjectRoot\docker-compose.yml" logs -f --tail=100
    }

    "status" {
        docker compose -f "$ProjectRoot\docker-compose.yml" ps
    }

    "clean" {
        Write-Host "🧹 Removing containers and volumes..." -ForegroundColor Yellow
        docker compose -f "$ProjectRoot\docker-compose.yml" down -v --remove-orphans
    }

    "help" {
        Write-Host ""
        Write-Host "Ring of the Middle Earth — Windows Run Script" -ForegroundColor Cyan
        Write-Host "=============================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Usage: .\run.ps1 <command>" -ForegroundColor White
        Write-Host ""
        Write-Host "Commands:" -ForegroundColor Yellow
        Write-Host "  up          Start full system (Docker: Kafka + 3 Go instances + NGINX)"
        Write-Host "  down        Stop all services"
        Write-Host "  test        Run unit tests (no Docker needed)"
        Write-Host "  test-race   Run tests with -race (needs C compiler)"
        Write-Host "  build       Build Go binary locally"
        Write-Host "  run-local   Run server locally without Docker/Kafka"
        Write-Host "  logs        Tail Docker logs"
        Write-Host "  status      Show container status"
        Write-Host "  clean       Remove containers + volumes"
        Write-Host ""
        Write-Host "Quick start:" -ForegroundColor Green
        Write-Host "  1. Start Docker Desktop"
        Write-Host "  2. .\run.ps1 up"
        Write-Host "  3. Open http://localhost (two tabs)"
        Write-Host ""
    }

    default {
        Write-Host "❌ Unknown command: $Command" -ForegroundColor Red
        Write-Host "Run: .\run.ps1 help" -ForegroundColor Yellow
    }
}
