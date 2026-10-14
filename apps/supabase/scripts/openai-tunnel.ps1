param(
    [ValidateSet('Doctor', 'Run')]
    [string] $Mode = 'Run'
)

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Impulso tunnel'
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$clientPath = Join-Path $workspacePath 'work/tools/tunnel-client/v0.0.16/tunnel-client.exe'
$profilePath = Join-Path $workspacePath 'work/tunnel/profiles/impulso.yaml'

if (!(Test-Path -LiteralPath $clientPath -PathType Leaf) -or
    !(Test-Path -LiteralPath $profilePath -PathType Leaf)) {
    throw 'The verified tunnel client and local Impulso profile must be installed first.'
}

# Plaintext is enabled only for the existing local MCP and OAuth endpoints.
$profileText = Get-Content -LiteralPath $profilePath -Raw
foreach ($match in [regex]::Matches($profileText, "http://[^`"'\s]+")) {
    $target = [uri] $match.Value
    $address = $null
    if (![Net.IPAddress]::TryParse($target.Host, [ref] $address) -or
        ![Net.IPAddress]::IsLoopback($address)) {
        throw 'The Impulso tunnel profile must use loopback addresses for every plaintext URL.'
    }
}

$previousKey = [Environment]::GetEnvironmentVariable('CONTROL_PLANE_API_KEY', 'Process')
$secureKey = $null
$clientExitCode = 1
try {
    if ([string]::IsNullOrWhiteSpace($previousKey)) {
        $secureKey = Read-Host 'Enter the OpenAI runtime key with Tunnels Read and Use permissions' -AsSecureString
        if ($secureKey.Length -eq 0) {
            throw 'A runtime key is required.'
        }
        $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        try {
            $env:CONTROL_PLANE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
        }
        finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
        }
    }

    $clientArguments = @(
        '--profile-file', $profilePath,
        '--control-plane.base-url', 'https://api.openai.com',
        '--control-plane.organization-id', 'org-U0ODhnVvMA2wOOZOTYj9JgOz',
        '--control-plane.tunnel-id', 'tunnel_6aceaecac7048191a405e1a511091710',
        '--control-plane.api-key', 'env:CONTROL_PLANE_API_KEY',
        '--harpoon.allow-plaintext-http',
        '--log.http-raw-unsafe=false',
        '--harpoon.capture-payloads=false'
    )
    & $clientPath doctor @clientArguments --explain --json
    $clientExitCode = $LASTEXITCODE
    if ($Mode -eq 'Run' -and $clientExitCode -eq 0) {
        & $clientPath run @clientArguments
        $clientExitCode = $LASTEXITCODE
    }
}
finally {
    [Environment]::SetEnvironmentVariable('CONTROL_PLANE_API_KEY', $previousKey, 'Process')
    if ($null -ne $secureKey) {
        $secureKey.Dispose()
    }
}

exit $clientExitCode
