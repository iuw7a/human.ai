# Build the Human AI desktop app (native .exe, no SDK needed).
# Uses the .NET Framework compiler that ships with Windows.
$ErrorActionPreference = 'Stop'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw 'csc.exe not found.' }
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $here 'dist'
if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }
$out = Join-Path $dist 'HumanAI.exe'
$speech = 'C:\Windows\Microsoft.NET\assembly\GAC_MSIL\System.Speech\v4.0_4.0.0.0__31bf3856ad364e35\System.Speech.dll'
if (-not (Test-Path $speech)) { throw 'System.Speech.dll not found.' }
& $csc /nologo /target:winexe /optimize+ /out:$out `
  /reference:System.Security.dll /reference:System.Web.Extensions.dll /reference:$speech `
  (Join-Path $here 'Core.cs') (Join-Path $here 'Avatar.cs') (Join-Path $here 'Island.cs') `
  (Join-Path $here 'Setup.cs') (Join-Path $here 'Program.cs')
Write-Output "Built: $out"
Get-Item $out | Select-Object Length, LastWriteTime
