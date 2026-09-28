import { spawn, type ChildProcess } from "child_process";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function buildScript(port: number, sessionId: string, stopToken: string): string {
  return `
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Xaml

$code = @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
}
"@
Add-Type -TypeDefinition $code | Out-Null

$port = ${port}
$session = '${sessionId.replace(/'/g, "''")}'
$token = '${stopToken.replace(/'/g, "''")}'

[xml]$borderXaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
  WindowStyle="None" AllowsTransparency="True" Background="Transparent"
  Topmost="True" ShowInTaskbar="False" WindowState="Maximized" Title="HumanAI-Control">
  <Border BorderBrush="#2F7CFF" BorderThickness="7" CornerRadius="4" Margin="2" />
</Window>
"@

[xml]$pillXaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
  WindowStyle="None" AllowsTransparency="True" Background="Transparent"
  Topmost="True" ShowInTaskbar="False" Width="430" Height="64" Title="HumanAI-Agent">
  <Border Background="#0B0B0DF2" BorderBrush="#2F7CFF" BorderThickness="1.5" CornerRadius="14" Padding="10,8">
    <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
      <Ellipse Width="10" Height="10" Fill="#E5484D" Margin="2,0,8,0" />
      <TextBlock Text="Human AI Agent is controlling your computer" Foreground="White" FontSize="12.5" VerticalAlignment="Center" />
      <Button Name="StopBtn" Content="Stop Agent" Margin="10,0,0,0" Padding="12,5"
        Background="#E5484D" Foreground="White" FontWeight="Bold" BorderThickness="0" Cursor="Hand">
        <Button.Resources>
          <Style TargetType="Border"><Setter Property="CornerRadius" Value="9"/></Style>
        </Button.Resources>
      </Button>
    </StackPanel>
  </Border>
</Window>
"@

$reader1 = New-Object System.Xml.XmlNodeReader $borderXaml
$borderWin = [Windows.Markup.XamlReader]::Load($reader1)
$reader2 = New-Object System.Xml.XmlNodeReader $pillXaml
$pillWin = [Windows.Markup.XamlReader]::Load($reader2)

$screenW = [System.Windows.SystemParameters]::PrimaryScreenWidth
$screenH = [System.Windows.SystemParameters]::PrimaryScreenHeight
$pillWin.Left = ($screenW - 430) / 2
$pillWin.Top = $screenH - 150

$stopBtn = $pillWin.FindName("StopBtn")
$stopBtn.Add_Click({
  try {
    $body = @{ sessionId = $session; token = $token } | ConvertTo-Json
    Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/agent-desktop/stop" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5 | Out-Null
  } catch {}
  [System.Windows.Application]::Current.Shutdown()
})

$borderWin.Show()
# click-through: WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_NOACTIVATE
$helper = New-Object System.Windows.Interop.WindowInteropHelper($borderWin)
$hwnd = $helper.Handle
$GWL_EXSTYLE = -20
$ex = [Win32]::GetWindowLong($hwnd, $GWL_EXSTYLE)
[Win32]::SetWindowLong($hwnd, $GWL_EXSTYLE, ($ex -bor 0x00080000 -bor 0x00000020 -bor 0x08000000)) | Out-Null
$pillWin.Show()
[System.Windows.Application]::new().Run() | Out-Null
`;
}

/** Launch the control overlay. Returns the child process (kill to remove).
 * NOTE: must NOT use detached:true — WPF exits instantly when detached. */
export function launchOverlay(port: number, sessionId: string, stopToken: string): ChildProcess {
  const file = join(tmpdir(), `humanai-overlay-${sessionId}.ps1`);
  writeFileSync(file, buildScript(port, sessionId, stopToken), "utf8");
  const proc = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-STA", "-File", file],
    { stdio: "ignore", windowsHide: true }
  );
  proc.unref();
  return proc;
}
