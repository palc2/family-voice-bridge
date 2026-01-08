# Check Deployment Status Script
# Usage: .\check-status.ps1

$API_URL = if ($env:STUDENT_PORTAL_URL) { $env:STUDENT_PORTAL_URL } else { "https://space.ai-builders.com/backend" }
$SERVICE_NAME = "pc2-family-voice-bridge"

if (-not $env:AI_BUILDER_TOKEN) {
    Write-Host "ERROR: AI_BUILDER_TOKEN environment variable not set" -ForegroundColor Red
    Write-Host "Please set it first: `$env:AI_BUILDER_TOKEN='your_token_here'" -ForegroundColor Yellow
    exit 1
}

Write-Host "`nChecking deployment status for: $SERVICE_NAME" -ForegroundColor Cyan
Write-Host "API URL: $API_URL/v1/deployments/$SERVICE_NAME" -ForegroundColor Gray
Write-Host ""

try {
    $headers = @{
        "Authorization" = "Bearer $env:AI_BUILDER_TOKEN"
    }
    
    $response = Invoke-RestMethod -Uri "$API_URL/v1/deployments/$SERVICE_NAME" `
        -Method Get `
        -Headers $headers
    
    # Color code the status
    $statusColor = switch ($response.status) {
        "HEALTHY" { "Green" }
        "UNHEALTHY" { "Red" }
        "ERROR" { "Red" }
        "deploying" { "Yellow" }
        "queued" { "Yellow" }
        default { "Gray" }
    }
    
    Write-Host "=== Deployment Status ===" -ForegroundColor Cyan
    Write-Host "Status: " -NoNewline
    Write-Host "$($response.status)" -ForegroundColor $statusColor
    Write-Host "Message: $($response.message)"
    
    if ($response.public_url) {
        Write-Host "Public URL: " -NoNewline
        Write-Host "$($response.public_url)" -ForegroundColor Green
    }
    
    if ($response.koyeb_status) {
        Write-Host "Koyeb Status: $($response.koyeb_status)"
    }
    
    if ($response.branch) {
        Write-Host "Branch: $($response.branch)"
    }
    
    if ($response.git_commit_id) {
        Write-Host "Git Commit: $($response.git_commit_id)"
    }
    
    Write-Host "Updated At: $($response.updated_at)"
    Write-Host ""
    
    # Show full response if needed
    if ($response.status -eq "HEALTHY") {
        Write-Host "✅ Deployment successful! Your app is live." -ForegroundColor Green
    } elseif ($response.status -in @("UNHEALTHY", "ERROR")) {
        Write-Host "❌ Deployment failed. Check the message above for details." -ForegroundColor Red
        Write-Host "`nFull response:" -ForegroundColor Yellow
        $response | ConvertTo-Json -Depth 5
    } else {
        Write-Host "⏳ Deployment in progress. Check again in a few minutes." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "ERROR: Failed to check deployment status" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody"
    }
}

