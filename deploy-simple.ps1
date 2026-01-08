# Simple Deployment Script
$API_URL = if ($env:STUDENT_PORTAL_URL) { $env:STUDENT_PORTAL_URL } else { "https://api.ai-builders.com/backend" }
$config = Get-Content "deploy-config.json" -Raw

if (-not $env:AI_BUILDER_TOKEN) {
    Write-Host "ERROR: AI_BUILDER_TOKEN environment variable not set"
    Write-Host "Please set it first: `$env:AI_BUILDER_TOKEN='your_token_here'"
    exit 1
}

Write-Host "Deploying to: $API_URL/v1/deployments"
Write-Host "Service: pc2-family-voice-bridge"
Write-Host ""

try {
    $headers = @{
        "Authorization" = "Bearer $env:AI_BUILDER_TOKEN"
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-RestMethod -Uri "$API_URL/v1/deployments" `
        -Method Post `
        -Headers $headers `
        -Body $config
    
    Write-Host "SUCCESS: Deployment queued!"
    Write-Host "Status: $($response.status)"
    Write-Host "Message: $($response.message)"
    Write-Host ""
    Write-Host "Check status with:"
    Write-Host "curl -X GET `"$API_URL/v1/deployments/pc2-family-voice-bridge`" -H `"Authorization: Bearer `$env:AI_BUILDER_TOKEN`""
}
catch {
    Write-Host "ERROR: Deployment failed"
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody"
    }
}

