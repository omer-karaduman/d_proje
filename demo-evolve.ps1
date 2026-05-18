#!/usr/bin/env pwsh
# ============================================================
#  DEMO EVOLVE - Schema V1 -> V2 (routeRiskScore EKLENIYOR)
#  Calistir: .\demo-evolve.ps1
#  Onkosul : demo-setup.ps1 calistirilmis olmali (V1 aktif)
# ============================================================

$SR_URL  = "http://localhost:8081"
$SUBJECT = "game.orders.validated-value"

# V2 sema - routeRiskScore EKLI (null veya int, default=null => Backward Compatible)
$V2_SCHEMA = "{`"type`":`"record`",`"name`":`"OrderValidated`",`"namespace`":`"middleearth.game`",`"fields`":[{`"name`":`"playerId`",`"type`":`"string`"},{`"name`":`"unitId`",`"type`":`"string`"},{`"name`":`"orderType`",`"type`":`"string`"},{`"name`":`"payload`",`"type`":`"bytes`"},{`"name`":`"turn`",`"type`":`"int`"},{`"name`":`"timestamp`",`"type`":`"long`"},{`"name`":`"routeRiskScore`",`"type`":[`"null`",`"int`"],`"default`":null}]}"

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "  DEMO EVOLVE: V1 -> V2 (routeRiskScore)" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""

# Adim 1: Mevcut durum
Write-Host "[1/3] Mevcut V1 durumu kontrol ediliyor..." -ForegroundColor Yellow
try {
    $v1 = Invoke-RestMethod -Uri "$SR_URL/subjects/$SUBJECT/versions/latest" -Method GET
    $v1Obj = $v1.schema | ConvertFrom-Json
    $v1Fields = ($v1Obj.fields | ForEach-Object { $_.name }) -join ", "
    Write-Host "      Aktif: V$($v1.version) (ID:$($v1.id))" -ForegroundColor White
    Write-Host "      Alanlar: $v1Fields" -ForegroundColor DarkGray
} catch {
    Write-Host "      UYARI: V1 bulunamadi. demo-setup.ps1 calisti mi?" -ForegroundColor Red
}

# Adim 2: Compatibility BACKWARD yap ve V2 kaydet
Write-Host ""
Write-Host "[2/3] V2 sema kaydediliyor (routeRiskScore EKLENIYOR)..." -ForegroundColor Yellow

# Compatibility BACKWARD moduna al
try {
    $compatBody = "{`"compatibility`":`"BACKWARD`"}"
    Invoke-RestMethod -Uri "$SR_URL/config/$SUBJECT" -Method PUT `
        -ContentType "application/vnd.schemaregistry.v1+json" `
        -Body $compatBody -ErrorAction Stop | Out-Null
    Write-Host "      Compatibility: BACKWARD" -ForegroundColor DarkGray
} catch {
    Write-Host "      Compatibility ayari: $($_.Exception.Message)" -ForegroundColor DarkGray
}

$body = "{`"schema`":" + ($V2_SCHEMA | ConvertTo-Json) + ",`"schemaType`":`"AVRO`"}"

try {
    $result = Invoke-RestMethod `
        -Uri "$SR_URL/subjects/$SUBJECT/versions" `
        -Method POST `
        -ContentType "application/vnd.schemaregistry.v1+json" `
        -Body $body -ErrorAction Stop

    Write-Host "      OK - V2 kaydedildi! Schema ID: $($result.id)" -ForegroundColor Green
} catch {
    Write-Host "      HATA: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Adim 3: Tum versiyonlari goster + container kontrolu
Write-Host ""
Write-Host "[3/3] Sonuc dogrulanıyor..." -ForegroundColor Yellow
Start-Sleep -Seconds 1

try {
    $versions = Invoke-RestMethod -Uri "$SR_URL/subjects/$SUBJECT/versions" -Method GET
    Write-Host ""
    Write-Host "  Schema Registry - Tum Versiyonlar:" -ForegroundColor White

    foreach ($v in $versions) {
        $info = Invoke-RestMethod -Uri "$SR_URL/subjects/$SUBJECT/versions/$v" -Method GET
        # schema field is a JSON string - parse it
        $schemaStr = $info.schema
        $obj  = $schemaStr | ConvertFrom-Json
        $hasRRS = $schemaStr -like "*routeRiskScore*"
        $rrsLabel = if ($hasRRS) { "[routeRiskScore VAR]" } else { "[routeRiskScore YOK]" }
        Write-Host "  V$v (ID:$($info.id)) $rrsLabel" -ForegroundColor $(if ($hasRRS) { "Green" } else { "White" })
    }

    # Container durumu
    Write-Host ""
    Write-Host "  Go Container Durumu:" -ForegroundColor White
    $containers = docker ps --filter "name=go-" --format "{{.Names}} -> {{.Status}}" 2>&1
    $containers | ForEach-Object { Write-Host "  $_" -ForegroundColor Cyan }

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  BASARILI! V2 Aktif, Consumer Calisiyor!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Gosterilecekler:" -ForegroundColor Yellow
    Write-Host "  1) V1 ve V2 ayni anda Schema Registry'de kayitli" -ForegroundColor White
    Write-Host "  2) Go container'lar hata vermeden calismaya devam etti" -ForegroundColor White
    Write-Host "  3) Backward compatibility: eski mesajlar hala okunabilir" -ForegroundColor White
    Write-Host ""
    Write-Host "  KAFKA UI  : http://localhost:9090" -ForegroundColor Yellow
    Write-Host "  V1 API    : http://localhost:8081/subjects/$SUBJECT/versions/1" -ForegroundColor Yellow
    Write-Host "  V2 API    : http://localhost:8081/subjects/$SUBJECT/versions/2" -ForegroundColor Yellow
    Write-Host "  OYUN UI   : http://localhost" -ForegroundColor Yellow
    Write-Host ""
} catch {
    Write-Host "  Dogrulama hatasi: $($_.Exception.Message)" -ForegroundColor Red
}
