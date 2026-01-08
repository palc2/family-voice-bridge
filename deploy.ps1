# Deployment script for Family Voice Bridge
# Uses the Student Portal Deployment API

param(
    [Parameter(Mandatory=$true)]
    [string]$AIBuilderToken
)

$API_URL = if ($env:STUDENT_PORTAL_URL) { $env:STUDENT_PORTAL_URL } else { "https://space.ai-builders.com/backend" }
$configPath = "deploy-config.json"

Write-Host "Reading deployment config from $configPath..." -ForegroundColor Cyan
$config = Get-Content $configPath | ConvertFrom-Json

Write-Host "`nDeployment Config:" -ForegroundColor Yellow
Write-Host "  Repo: $($config.repo_url)" -ForegroundColor Gray
Write-Host "  Branch: $($config.branch)" -ForegroundColor Gray
Write-Host "  Service: $($config.service_name)" -ForegroundColor Gray
Write-Host "  Port: $($config.port)" -ForegroundColor Gray

$body = @{
    repo_url = $config.repo_url
    branch = $config.branch
    service_name = $config.service_name
    port = $config.port
    env_vars = $config.env_vars
} | ConvertTo-Json -Depth 10

Write-Host "`nTriggering deployment..." -ForegroundColor Cyan
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
    Write-Host "  2. Check status with: Get-DeploymentStatus -ServiceName $($config.service_name) -Token 'your-token'" -ForegroundColor Gray
    Write-Host "  3. Your app will be available at: https://$($config.service_name).ai-builders.space" -ForegroundColor Gray
    
    return $response
} catch {
    Write-Host "`n❌ Deployment failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    throw
}
