# Check or update graph cache metadata
# Usage: pwsh scripts/manage-graph-cache.ps1 [check|update|reset]

param(
    [string]$Action = "check"
)

$cacheFile = ".\.copilot\graph-cache.json"

function Get-UnixTimestamp {
    return [int][double]::Parse((Get-Date -UFormat %s))
}

function Get-ISOTimestamp {
    return (Get-Date).ToUniversalTime().ToString("o")
}

function Check-Cache {
    if (-not (Test-Path $cacheFile)) {
        Write-Host "❌ Cache file not found. Run 'reset' to initialize." -ForegroundColor Red
        return
    }

    $cache = Get-Content $cacheFile | ConvertFrom-Json
    $now = Get-UnixTimestamp
    $lastUpdate = $cache.lastUpdateTimestamp
    
    if ($null -eq $lastUpdate) {
        Write-Host "⚠️  Graph has never been built." -ForegroundColor Yellow
        return
    }

    $ageHours = [math]::Round(($now - $lastUpdate) / 3600, 1)
    $graphStatus = if ($cache.graphExists) { "✅ EXISTS" } else { "❌ MISSING" }
    
    Write-Host "Graph Status: $graphStatus"
    Write-Host "Last Updated: $($cache.lastUpdate)"
    Write-Host "Age: $ageHours hours"
    Write-Host "Files Analyzed: $($cache.fileCount)"
    
    if ($ageHours -gt 24) {
        Write-Host "`n⚠️  Graph is older than 24h. Run 'python -m code_review_graph update' to refresh." -ForegroundColor Yellow
    } else {
        Write-Host "`n✅ Graph cache is current." -ForegroundColor Green
    }
}

function Update-Cache {
    Write-Host "Updating cache metadata..." -ForegroundColor Cyan
    
    $cache = @{
        lastUpdate = Get-ISOTimestamp
        lastUpdateTimestamp = Get-UnixTimestamp
        fileCount = 0  # Would be populated by actual graph tool
        graphExists = $true
        cacheStrategy = "update-if-older-than-24h"
    }
    
    $cache | ConvertTo-Json | Set-Content $cacheFile
    Write-Host "✅ Cache metadata updated." -ForegroundColor Green
}

function Reset-Cache {
    Write-Host "Resetting cache..." -ForegroundColor Yellow
    
    $cache = @{
        lastUpdate = $null
        lastUpdateTimestamp = $null
        fileCount = $null
        graphExists = $false
        cacheStrategy = "update-if-older-than-24h"
        notes = "Cache reset. Run 'python -m code_review_graph build' to initialize."
    }
    
    $cache | ConvertTo-Json | Set-Content $cacheFile
    Write-Host "✅ Cache reset. Next, run: python -m code_review_graph build" -ForegroundColor Green
}

# Execute requested action
switch ($Action.ToLower()) {
    "check" { Check-Cache }
    "update" { Update-Cache }
    "reset" { Reset-Cache }
    default { 
        Write-Host "Unknown action: $Action" -ForegroundColor Red
        Write-Host "Usage: pwsh scripts/manage-graph-cache.ps1 [check|update|reset]"
    }
}
