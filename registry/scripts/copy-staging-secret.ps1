param(
    [ValidateSet('GITHUB_WEBHOOK_SECRET', 'VALIDATOR_TOKEN')]
    [string]$Name = 'GITHUB_WEBHOOK_SECRET'
)

# Windows encrypts this local backup for the current user. Never print its plaintext.
$secretBackupPath = Join-Path $env:LOCALAPPDATA 'NEMESIS\registry-staging.secrets.json'
$secretBackup = Get-Content -LiteralPath $secretBackupPath -Raw | ConvertFrom-Json
$protectedValue = $secretBackup.secrets.$Name
if (-not $protectedValue) { throw 'The requested staging secret was not found.' }
$secureValue = ConvertTo-SecureString -String $protectedValue
$plainValue = [System.Net.NetworkCredential]::new('', $secureValue).Password
Set-Clipboard -Value $plainValue
Remove-Variable plainValue
Write-Output "Copied $Name to your clipboard. No secret was printed."
