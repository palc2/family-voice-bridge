# Deployment script using build_args for DATABASE_URL
# This keeps credentials out of git while allowing them to be passed during Docker build

param(
    [Parameter(Mandatory=$false)]
    [string]$AIBuilderToken = $env:AI_BUILDER_TOKEN
)

if (-not $AIBuilderToken) {
    Write-Host "ERROR: AI_BUILDER_TOKEN not provided" -ForegroundColor Red
    Write-Host "Usage: .\deploy-with-build-args.ps1 -AIBuilderToken 'your_token'" -ForegroundColor Yellow
    Write-Host "   OR: Set `$env:AI_BUILDER_TOKEN='your_token' first" -ForegroundColor Yellow
    exit 1
}

$API_URL = "https://space.ai-builders.com/backend"
$configPath = "deploy-config.json"

if (-not (Test-Path $configPath)) {
    Write-Host "ERROR: deploy-config.json not found" -ForegroundColor Red
    exit 1
}

Write-Host "Reading deployment config from $configPath..." -ForegroundColor Cyan
$config = Get-Content $configPath | ConvertFrom-Json

Write-Host "`nDeployment Config:" -ForegroundColor Yellow
Write-Host "  Repo: $($config.repo_url)" -ForegroundColor Gray
Write-Host "  Branch: $($config.branch)" -ForegroundColor Gray
Write-Host "  Service: $($config.service_name)" -ForegroundColor Gray
Write-Host "  Port: $($config.port)" -ForegroundColor Gray
Write-Host "  Using build_args for DATABASE_URL (secure)" -ForegroundColor Green

$body = @{
    repo_url = $config.repo_url
    branch = $config.branch
    service_name = $config.service_name
    port = $config.port
    build_args = @{
        DATABASE_URL = $config.env_vars.DATABASE_URL
    }
    env_vars = @{
        NODE_ENV = $config.env_vars.NODE_ENV
    }
} | ConvertTo-Json -Depth 10

Write-Host "`nTriggering deployment with build_args..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$API_URL/v1/deployments" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $AIBuilderToken"
            "Content-Type" = "application/json"
        } `
        -Body $body `
        -ErrorAction Stop

    Write-Host "`n✅ Deployment queued successfully!" -ForegroundColor Green
    Write-Host "`nDeployment Status:" -ForegroundColor Yellow
    Write-Host "  Service: $($response.service_name)" -ForegroundColor Gray
    Write-Host "  Status: $($response.status)" -ForegroundColor Gray
    Write-Host "  Message: $($response.message)" -ForegroundColor Gray
    
    if ($response.public_url) {
        Write-Host "  URL: $($response.public_url)" -ForegroundColor Green
    }
    
    Write-Host "`n📋 Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Wait 5-10 minutes for deployment to complete" -ForegroundColor Gray
    Write-Host "  2. Check status: .\check-status.ps1" -ForegroundColor Gray
    Write-Host "  3. Test: $($response.public_url)" -ForegroundColor Gray
    Write-Host "`n✅ DATABASE_URL is passed via build_args (not in git!)" -ForegroundColor Green
    
    return $response
} catch {
    Write-Host "`n❌ Deployment failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    throw
}

