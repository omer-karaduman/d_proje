#!/usr/bin/env pwsh
# ============================================================
#  DEMO SETUP - Schema V1'i manuel REST API ile kaydet
#  Calistir: .\demo-setup.ps1
#  Onkosul : docker-compose up ile sistem ayakta olmali
# ============================================================

$SR_URL  = "http://localhost:8081"
$SUBJECT = "game.orders.validated-value"

# V1 sema - routeRiskScore YOK
$V1_SCHEMA = "{`"type`":`"record`",`"name`":`"OrderValidated`",`"namespace`":`"middleearth.game`",`"fields`":[{`"name`":`"playerId`",`"type`":`"string`"},{`"name`":`"unitId`",`"type`":`"string`"},{`"name`":`"orderType`",`"type`":`"string`"},{`"name`":`"payload`",`"type`":`"bytes`"},{`"name`":`"turn`",`"type`":`"int`"},{`"name`":`"timestamp`",`"type`":`"long`"}]}"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DEMO SETUP: Schema Registry V1 Kurulumu" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Adim 1: Schema Registry hazir mi?
Write-Host "[1/4] Schema Registry kontrol ediliyor..." -ForegroundColor Yellow
$retries = 0
do {
    Start-Sleep -Seconds 2
    try {
        Invoke-RestMethod -Uri "$SR_URL/subjects" -Method GET -ErrorAction Stop | Out-Null
        Write-Host "      OK - Schema Registry hazir!" -ForegroundColor Green
        break
    } catch {
        $retries++
        if ($retries -ge 15) {
            Write-Host "      HATA: Schema Registry'ye ulasilamadi!" -ForegroundColor Red
            exit 1
        }
        Write-Host "      Bekleniyor... ($retries/15)" -ForegroundColor DarkGray
    }
} while ($true)

# Adim 2: Mevcut subject'i tamamen sil
Write-Host ""
Write-Host "[2/4] Mevcut sema temizleniyor..." -ForegroundColor Yellow

# Compatibility modunu NONE yap (silmeyi kolaylastirir)
try {
    $compatBody = "{`"compatibility`":`"NONE`"}"
    Invoke-RestMethod -Uri "$SR_URL/config/$SUBJECT" -Method PUT `
        -ContentType "application/vnd.schemaregistry.v1+json" `
        -Body $compatBody -ErrorAction SilentlyContinue | Out-Null
} catch {}

# Soft delete
try {
    Invoke-RestMethod -Uri "$SR_URL/subjects/$SUBJECT" -Method DELETE -ErrorAction Stop | Out-Null
    Write-Host "      Soft delete tamam." -ForegroundColor DarkGray
    Start-Sleep -Seconds 1
} catch {
    Write-Host "      Soft delete: $($_.Exception.Message)" -ForegroundColor DarkGray
}

# Hard delete
try {
    Invoke-RestMethod -Uri "$SR_URL/subjects/${SUBJECT}?permanent=true" -Method DELETE -ErrorAction Stop | Out-Null
    Write-Host "      Hard delete tamam." -ForegroundColor DarkGray
} catch {
    Write-Host "      Hard delete: $($_.Exception.Message)" -ForegroundColor DarkGray
}

Write-Host "      OK - Sema temizlendi." -ForegroundColor Green

# Adim 3: V1 semasi kaydet (routeRiskScore YOK)
Write-Host ""
Write-Host "[3/4] V1 sema kaydediliyor (routeRiskScore YOK)..." -ForegroundColor Yellow

$body = "{`"schema`":" + ($V1_SCHEMA | ConvertTo-Json) + ",`"schemaType`":`"AVRO`"}"

try {
    $result = Invoke-RestMethod `
        -Uri "$SR_URL/subjects/$SUBJECT/versions" `
        -Method POST `
        -ContentType "application/vnd.schemaregistry.v1+json" `
        -Body $body -ErrorAction Stop

    Write-Host "      OK - V1 kaydedildi! Schema ID: $($result.id)" -ForegroundColor Green
} catch {
    Write-Host "      HATA: $($_.Exception.Message)" -ForegroundColor Red
    # Debug: ham hata goster
    Write-Host "      Body gonderilen: $body" -ForegroundColor DarkGray
    exit 1
}

# Adim 4: Dogrulama
Write-Host ""
Write-Host "[4/4] Dogrulama..." -ForegroundColor Yellow
Start-Sleep -Seconds 1

try {
    $schema = Invoke-RestMethod -Uri "$SR_URL/subjects/$SUBJECT/versions/latest" -Method GET
    $schemaObj = $schema.schema | ConvertFrom-Json
    $fieldNames = ($schemaObj.fields | ForEach-Object { $_.name }) -join ", "
    $hasRRS = ($schemaObj.fields | Where-Object { $_.name -eq "routeRiskScore" }).Count -gt 0

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  DEMO HAZIR - V1 Aktif!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Subject   : $SUBJECT" -ForegroundColor White
    Write-Host "  Version   : $($schema.version)" -ForegroundColor White
    Write-Host "  Schema ID : $($schema.id)" -ForegroundColor White
    Write-Host "  Alanlar   : $fieldNames" -ForegroundColor White

    if ($hasRRS) {
        Write-Host "  UYARI: routeRiskScore MEVCUT (beklenmedik!)" -ForegroundColor Red
    } else {
        Write-Host "  routeRiskScore: YOK" -ForegroundColor Cyan
    }

    Write-Host ""
    Write-Host "  KAFKA UI  : http://localhost:9090" -ForegroundColor Yellow
    Write-Host "  REST API  : http://localhost:8081/subjects/$SUBJECT/versions/1" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Sonraki adim: .\demo-evolve.ps1" -ForegroundColor Magenta
    Write-Host ""
} catch {
    Write-Host "  Dogrulama hatasi: $($_.Exception.Message)" -ForegroundColor Red
}
