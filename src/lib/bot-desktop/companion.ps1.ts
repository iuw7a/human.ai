/** Builds the Human Bot Desktop companion (.ps1) — Dynamic Island style.
 *  Top-center pill (avatar + name) that spring-expands downward into a chat
 *  panel. PowerShell 5.1 safe. States: idle/listening/thinking/responding/
 *  working/attention. Position persisted; autostart via companion .cmd.
 */

export interface CompanionScriptInput {
  apiBase: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  accent: string;
  size: number;
  alwaysOnTop: boolean;
  tts: boolean;
  stt: boolean;
}

function q(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export function buildCompanionScript(c: CompanionScriptInput): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(c.accent) ? c.accent : "#e5484d";
  const pillH = Math.min(64, Math.max(40, Math.round(c.size * 0.72)));
  const script = `# ============================================================
# Human Bot Desktop companion — Dynamic Island edition
# Bot: ${c.slug}  Server: ${c.apiBase}
# Run: powershell -ExecutionPolicy Bypass -Command "& '<this>.ps1'"
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'

$ApiBase = ${q(c.apiBase)}
$BotSlug = ${q(c.slug)}
$BotName = ${q(c.name)}
$AvatarUrl = ${q(c.avatarUrl ?? "")}
$Accent = ${q(accent)}
$PillH = ${pillH}
$PillW = 208
$PanelW = 380
$PanelH = 524
$TopMargin = 8
$DefaultTop = ${c.alwaysOnTop ? "$true" : "$false"}
$DefaultTts = ${c.tts ? "$true" : "$false"}
$DefaultStt = ${c.stt ? "$true" : "$false"}

$BootLog = Join-Path $env:TEMP ('humanbot-' + $BotSlug + '.log')
function Write-BootLog($m) {
  try { Add-Content $BootLog ('[' + (Get-Date -Format 'HH:mm:ss') + '] ' + $m) } catch {}
}
trap {
  Write-BootLog ('FATAL: ' + $_.Exception.Message)
  try { Write-BootLog ('AT: ' + $_.ScriptStackTrace) } catch {}
  try { Write-BootLog ('POS: ' + $_.InvocationInfo.PositionMessage) } catch {}
}
Write-BootLog 'start'

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Xaml
Add-Type -AssemblyName System.Speech
Add-Type -AssemblyName System.Net.Http

$StateDir = Join-Path $env:APPDATA 'HumanAI\\bots'
if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Path $StateDir -Force | Out-Null }
$StateFile = Join-Path $StateDir ($BotSlug + '.json')
$AvatarFile = Join-Path $env:TEMP ('humanbot-' + $BotSlug + '.png')

$state = $null
if (Test-Path $StateFile) {
  try { $state = Get-Content $StateFile -Raw | ConvertFrom-Json } catch { $state = $null }
}
if (-not $state) {
  $state = [pscustomobject]@{ apiKey = ''; convId = ''; x = $null; size = $PillH; top = $DefaultTop; tts = $DefaultTts; stt = $DefaultStt; collapsed = $true }
}
function Save-State {
  $state | ConvertTo-Json | Set-Content $StateFile -Encoding UTF8
}

if (-not $state.apiKey) {
  Add-Type -AssemblyName Microsoft.VisualBasic
  $k = [Microsoft.VisualBasic.Interaction]::InputBox('Paste your Human Bot Desktop key (from the Bot Desktop page):', 'Human Bot Desktop — ' + $BotName, '')
  if (-not $k) { exit }
  $state.apiKey = $k.Trim()
  Save-State
}
$Headers = @{ 'x-api-key' = $state.apiKey }

if ($AvatarUrl -ne '' -and -not (Test-Path $AvatarFile)) {
  try { Invoke-WebRequest -Uri $AvatarUrl -OutFile $AvatarFile -TimeoutSec 20 } catch {}
}
Write-BootLog 'avatar-ok'

$sync = [hashtable]::Synchronized(@{ stop = $false; busy = $false })
$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromSeconds(30)
foreach ($h in $Headers.Keys) { $http.DefaultRequestHeaders.Add($h, $Headers[$h]) | Out-Null }

function Api-Get($path) {
  $r = $http.GetAsync($ApiBase + $path).GetAwaiter().GetResult()
  if (-not $r.IsSuccessStatusCode) { return $null }
  return ($r.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json)
}
function Api-Post($path, $body) {
  $json = ($body | ConvertTo-Json -Depth 6)
  $ct = New-Object System.Net.Http.StringContent($json, [Text.Encoding]::UTF8, 'application/json')
  $r = $http.PostAsync($ApiBase + $path, $ct).GetAwaiter().GetResult()
  if (-not $r.IsSuccessStatusCode) { return $null }
  return ($r.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json)
}
function Api-Patch($path, $body) {
  $json = ($body | ConvertTo-Json -Depth 6)
  $m = New-Object System.Net.Http.HttpMethod('PATCH')
  $req = New-Object System.Net.Http.HttpRequestMessage($m, ($ApiBase + $path))
  $req.Content = New-Object System.Net.Http.StringContent($json, [Text.Encoding]::UTF8, 'application/json')
  $r = $http.SendAsync($req).GetAwaiter().GetResult()
  return $r.IsSuccessStatusCode
}

$speaker = $null
try { $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer } catch {}
function Speak($text) {
  if (-not $state.tts) { return }
  if (-not $speaker) { return }
  try { $speaker.SpeakAsyncCancelAll() | Out-Null; $speaker.SpeakAsync($text) | Out-Null } catch {}
}

# ---------- island window ----------
[xml]$islandXaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
  WindowStyle="None" AllowsTransparency="True" Background="Transparent"
  ShowInTaskbar="False" Title="__NAME__">
  <Border Name="Island" CornerRadius="24" Background="#0B0B0DF2"
    BorderBrush="#2A2A30" BorderThickness="1">
    <Border.Effect>
      <DropShadowEffect Color="Black" Opacity="0.55" ShadowDepth="6" BlurRadius="22" />
    </Border.Effect>
    <DockPanel LastChildFill="True">
      <Grid Name="PillRow" DockPanel.Dock="Top" Height="__PILLH__" Background="Transparent">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="Auto" />
          <ColumnDefinition Width="*" />
          <ColumnDefinition Width="Auto" />
          <ColumnDefinition Width="Auto" />
        </Grid.ColumnDefinitions>
        <Grid Grid.Column="0" Name="AvatarWrap" Margin="9,0,0,0" HorizontalAlignment="Center" VerticalAlignment="Center">
          <Ellipse Name="AvatarRing" Stroke="__ACCENT__" StrokeThickness="2" />
          <Ellipse Name="AvatarFace" Margin="3" />
          <TextBlock Name="AvatarFallback" Foreground="White" FontWeight="Bold"
            HorizontalAlignment="Center" VerticalAlignment="Center" Visibility="Collapsed" />
        </Grid>
        <TextBlock Grid.Column="1" Name="PillName" Foreground="White" FontWeight="SemiBold" FontSize="13"
          Margin="9,0,0,0" VerticalAlignment="Center" TextTrimming="CharacterEllipsis" />
        <Ellipse Grid.Column="2" Name="PillDot" Width="8" Height="8" Fill="#10b981" Margin="8,0,2,0" />
        <TextBlock Grid.Column="3" Name="Chevron" Foreground="#71717a" FontSize="12" Text="v"
          Margin="0,0,12,0" VerticalAlignment="Center" />
      </Grid>
      <Grid Name="ChatArea" Visibility="Collapsed" Opacity="0">
        <Grid.RowDefinitions>
          <RowDefinition Height="Auto" />
          <RowDefinition Height="*" />
          <RowDefinition Height="Auto" />
          <RowDefinition Height="Auto" />
        </Grid.RowDefinitions>
        <Border Grid.Row="0" Background="#00000000" Padding="14,6,14,8" Name="HeadDrag">
          <DockPanel>
            <StackPanel VerticalAlignment="Center">
              <TextBlock Name="HeadStatus" Foreground="#a1a1aa" FontSize="11" Text="Idle" />
            </StackPanel>
            <StackPanel DockPanel.Dock="Right" Orientation="Horizontal" HorizontalAlignment="Right">
              <Button Name="BtnPin" Content="Pin" ToolTip="Stay above windows" Background="Transparent" Foreground="#71717a" BorderThickness="0" FontSize="11" Padding="6,2" Cursor="Hand" />
              <Button Name="BtnPage" Content="Open" ToolTip="Open full page" Background="Transparent" Foreground="#71717a" BorderThickness="0" FontSize="11" Padding="6,2" Cursor="Hand" />
              <Button Name="BtnX" Content="X" ToolTip="Collapse (Esc)" Background="Transparent" Foreground="#71717a" BorderThickness="0" FontSize="12" Padding="8,2" Cursor="Hand" />
            </StackPanel>
          </DockPanel>
        </Border>
        <ScrollViewer Grid.Row="1" Margin="12,0" Name="Scroller" VerticalScrollBarVisibility="Auto">
          <StackPanel Name="Messages" />
        </ScrollViewer>
        <TextBlock Grid.Row="1" Name="HintLine" Foreground="#52525b" FontSize="13"
          HorizontalAlignment="Center" VerticalAlignment="Center" Text="Ask for anything…" IsHitTestVisible="False" />
        <TextBlock Grid.Row="2" Name="StateLine" Foreground="#71717a" FontSize="11" Margin="14,2" Text="" Visibility="Collapsed" />
        <Grid Grid.Row="3" Margin="12,6,12,12">
          <Grid.ColumnDefinitions>
            <ColumnDefinition Width="*" />
            <ColumnDefinition Width="Auto" />
            <ColumnDefinition Width="Auto" />
            <ColumnDefinition Width="Auto" />
          </Grid.ColumnDefinitions>
          <TextBox Name="Input" Grid.Column="0" Background="#131316" Foreground="White"
            BorderBrush="#26262c" BorderThickness="1" Padding="9,8" FontSize="13"
            VerticalContentAlignment="Center">
            <TextBox.Resources>
              <Style TargetType="Border"><Setter Property="CornerRadius" Value="12" /></Style>
            </TextBox.Resources>
          </TextBox>
          <Button Name="BtnMic" Grid.Column="1" Content="Mic" ToolTip="Voice input" Margin="6,0,0,0" FontSize="11"
            Background="#131316" Foreground="White" BorderBrush="#26262c" Width="42" Cursor="Hand">
            <Button.Resources><Style TargetType="Border"><Setter Property="CornerRadius" Value="12" /></Style></Button.Resources>
          </Button>
          <Button Name="BtnSpeak" Grid.Column="2" Content="Read" ToolTip="Read aloud" Margin="6,0,0,0" FontSize="11"
            Background="#131316" Foreground="White" BorderBrush="#26262c" Width="42" Cursor="Hand">
            <Button.Resources><Style TargetType="Border"><Setter Property="CornerRadius" Value="12" /></Style></Button.Resources>
          </Button>
          <Button Name="BtnSend" Grid.Column="3" Content="Send" Margin="6,0,0,0" FontSize="12" FontWeight="SemiBold"
            Background="#e5484d" Foreground="White" BorderThickness="0" Padding="12,0" Cursor="Hand">
            <Button.Resources><Style TargetType="Border"><Setter Property="CornerRadius" Value="12" /></Style></Button.Resources>
          </Button>
        </Grid>
      </Grid>
    </DockPanel>
  </Border>
</Window>
"@

$win = $null
$island = $null
$pillRow = $null
$avatarWrap = $null
$avatarRing = $null
$avatarFace = $null
$avatarBrush = $null
$avatarFallback = $null
$pillName = $null
$pillDot = $null
$chevron = $null
$chatArea = $null
$headStatus = $null
$msgStack = $null
$scroller = $null
$stateLine = $null
$inputBox = $null
$convId = ''
$expanded = $false
$miniHidden = $false
$pillCurH = 0
$uiState = 'idle'
$historyList = New-Object System.Collections.ArrayList

function Screen-CenterX {
  return ([System.Windows.SystemParameters]::PrimaryScreenWidth / 2) + $state.x
}
function Place-Island($w, $h) {
  $cx = Screen-CenterX
  if (-not $cx) { $cx = [System.Windows.SystemParameters]::PrimaryScreenWidth / 2 }
  $win.Width = $w
  $win.Height = $h
  $win.Left = $cx - ($w / 2)
  $win.Top = $TopMargin
}

function Ease-OutCubic($t) { return 1 - [Math]::Pow(1 - $t, 3) }
function Ease-InCubic($t) { return [Math]::Pow($t, 3) }
function Ease-OutBack($t) {
  $c = 1.4
  $u = $t - 1
  return 1 + ($c + 1) * $u * $u * $u + $c * $u * $u
}

$anim = @{ active = $false; t0 = $null; dur = 240; fromW = 0; fromH = 0; toW = 0; toH = 0; ease = 'out'; onDone = $null }
$animTimer = New-Object System.Windows.Threading.DispatcherTimer
$animTimer.Interval = [TimeSpan]::FromMilliseconds(15)
$animTimer.Add_Tick({
  if (-not $anim.active) { return }
  $el = ([DateTime]::UtcNow - $anim.t0).TotalMilliseconds
  $t = $el / $anim.dur
  if ($t -ge 1) { $t = 1 }
  if ($anim.ease -eq 'back') { $e = Ease-OutBack $t }
  elseif ($anim.ease -eq 'in') { $e = Ease-InCubic $t }
  else { $e = Ease-OutCubic $t }
  $w = $anim.fromW + ($anim.toW - $anim.fromW) * $e
  $h = $anim.fromH + ($anim.toH - $anim.fromH) * $e
  if ($w -lt 20) { $w = 20 }
  if ($h -lt 20) { $h = 20 }
  Place-Island $w $h
  if ($expanded) {
    $op = $t
    if ($op -gt 1) { $op = 1 }
    $chatArea.Opacity = $op
  }
  if ($t -ge 1) {
    $anim.active = $false
    $animTimer.Stop()
    $cb = $anim.onDone
    $anim.onDone = $null
    if ($cb) { & $cb }
  }
})

function Start-Anim($toW, $toH, $dur, $ease, $onDone) {
  $anim.fromW = $win.Width
  $anim.fromH = $win.Height
  $anim.toW = $toW
  $anim.toH = $toH
  $anim.dur = $dur
  $anim.ease = $ease
  $anim.onDone = $onDone
  $anim.t0 = [DateTime]::UtcNow
  $anim.active = $true
  $animTimer.Start()
}

function Set-Dot($color) {
  $win.Dispatcher.Invoke([action]{ $pillDot.Fill = $color })
}

$conv = New-Object System.Windows.Media.BrushConverter
function To-Brush($hex) {
  try { return $conv.ConvertFromString($hex) } catch { return '#e5484d' }
}

function Set-Status($text, $botState) {
  $script:uiState = $botState
  $win.Dispatcher.Invoke([action]{
    $headStatus.Text = $text
    if ($text -eq '') {
      $stateLine.Visibility = 'Collapsed'
    } else {
      $stateLine.Visibility = 'Visible'
      $stateLine.Text = $text
    }
    if ($botState -eq 'listening') { $pillDot.Fill = To-Brush '#10b981' }
    elseif ($botState -eq 'thinking' -or $botState -eq 'responding') { $pillDot.Fill = To-Brush '#e5484d' }
    elseif ($botState -eq 'working') { $pillDot.Fill = To-Brush '#f59e0b' }
    elseif ($botState -eq 'attention') { $pillDot.Fill = To-Brush '#e5484d' }
    else { $pillDot.Fill = To-Brush '#10b981' }
  })
  if ($botState -eq 'thinking' -or $botState -eq 'responding' -or $botState -eq 'working') {
    Start-AvatarPulse
  } else {
    Stop-AvatarPulse
  }
  if ($botState -eq 'thinking') { Start-Dots } else { Stop-Dots }
}

$pulseTimer = New-Object System.Windows.Threading.DispatcherTimer
$pulseTimer.Interval = [TimeSpan]::FromMilliseconds(90)
$pulseOn = $false
$pulseTimer.Add_Tick({
  $pulseOn = -not $pulseOn
  if ($pulseOn) { $avatarWrap.Opacity = 0.55 } else { $avatarWrap.Opacity = 1.0 }
})
function Start-AvatarPulse { $pulseTimer.Start() }
function Stop-AvatarPulse { $pulseTimer.Stop(); $avatarWrap.Opacity = 1.0 }

$dotsTimer = New-Object System.Windows.Threading.DispatcherTimer
$dotsTimer.Interval = [TimeSpan]::FromMilliseconds(380)
$dotsN = 0
$waveFrames = @('|', '||', '|||', '||||', '|||', '||')
$waveN = 0
$dotsTimer.Add_Tick({
  if ($script:uiState -eq 'listening') {
    $waveN = ($waveN + 1) % $waveFrames.Count
    $w = $waveFrames[$waveN]
    $headStatus.Text = $w + ' Listening'
    $stateLine.Text = $w + ' Listening — tap Mic to stop'
  } else {
    $dotsN = ($dotsN + 1) % 4
    $d = ''
    for ($i = 0; $i -lt $dotsN; $i++) { $d += '.' }
    $headStatus.Text = 'Thinking' + $d
    $stateLine.Text = 'Thinking' + $d
  }
})
function Start-Dots { $dotsN = 0; $dotsTimer.Start() }
function Stop-Dots { $dotsTimer.Stop() }

$attnTimer = New-Object System.Windows.Threading.DispatcherTimer
$attnTimer.Interval = [TimeSpan]::FromMilliseconds(16)
$attnT0 = $null
$attnBaseW = 0
$attnTimer.Add_Tick({
  $el = ([DateTime]::UtcNow - $attnT0).TotalMilliseconds
  if ($el -ge 1200) { $attnTimer.Stop(); Place-Island $attnBaseW $attnBaseH; return }
  $pulse = [Math]::Sin($el / 1200 * 3.14159 * 4) * 9
  Place-Island ($attnBaseW + $pulse) $attnBaseH
})
function Notify-Attention {
  if ($expanded) { return }
  Set-Status 'New message — click to read' 'attention'
  $attnBaseW = $PillW
  $attnBaseH = $win.Height
  $attnT0 = [DateTime]::UtcNow
  $attnTimer.Start()
}

function Expand-Island($instant) {
  if ($expanded) { return }
  if ($script:miniHidden) { Restore-Island }
  $script:expanded = $true
  $chevron.Text = '^'
  $chatArea.Visibility = 'Visible'
  $chatArea.Opacity = 0
  if ($instant) {
    Place-Island $PanelW $PanelH
    $chatArea.Opacity = 1
  } else {
    Start-Anim $PanelW $PanelH 260 'back' $null
  }
  $state.collapsed = $false
  Save-State
  Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ collapsed = $false } | Out-Null
  Ensure-Conversation
  $inputBox.Focus() | Out-Null
}

function Collapse-Island {
  if (-not $expanded) { return }
  $script:expanded = $false
  $chevron.Text = 'v'
  $ph = $pillCurH
  if (-not $ph) { $ph = $PillH }
  Start-Anim $PillW $ph 200 'in' {
    $chatArea.Visibility = 'Collapsed'
    $chatArea.Opacity = 0
    Set-Status 'Idle' 'idle'
  }
  $state.collapsed = $true
  Save-State
  Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ collapsed = $true } | Out-Null
}

function Toggle-Island {
  if ($script:miniHidden) { Restore-Island; return }
  if ($expanded) { Collapse-Island } else { Expand-Island $false }
}

function Apply-IslandSize($ph) {
  if (-not $ph) { $ph = $PillH }
  $script:pillCurH = $ph
  $pillRow.Height = $ph
  $avatarWrap.Width = $ph - 16
  $avatarWrap.Height = $ph - 16
  $avatarFace.Width = $ph - 16
  $avatarFace.Height = $ph - 16
  $avatarFallback.FontSize = [int](($ph - 16) * 0.4)
}

function Hide-Island {
  $script:miniHidden = $true
  $anim.active = $false
  $animTimer.Stop()
  Place-Island 22 22
  $chatArea.Visibility = 'Collapsed'
  $island.CornerRadius = 11
  Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ hidden = $true } | Out-Null
}
function Restore-Island {
  $script:miniHidden = $false
  $island.CornerRadius = 24
  $ph = $state.size
  if (-not $ph) { $ph = $PillH }
  Apply-IslandSize $ph
  Place-Island $PillW $ph
  Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ hidden = $false } | Out-Null
}

function Add-Message($role, $text) {
  $win.Dispatcher.Invoke([action]{
    $hint = $win.FindName('HintLine')
    if ($hint) { $hint.Visibility = 'Collapsed' }
    $b = New-Object System.Windows.Controls.Border
    if ($role -eq 'user') { $b.CornerRadius = New-Object System.Windows.CornerRadius(12,12,4,12) } else { $b.CornerRadius = New-Object System.Windows.CornerRadius(12,12,12,4) }
    $b.Padding = '10,7'
    $b.Margin = '0,0,0,8'
    $b.MaxWidth = 300
    if ($role -eq 'user') {
      $b.Background = To-Brush '#26262c'
      $b.HorizontalAlignment = 'Right'
    } else {
      $b.Background = To-Brush '#131316'
      $b.BorderBrush = To-Brush '#26262c'
      $b.BorderThickness = '1'
      $b.HorizontalAlignment = 'Left'
    }
    $t = New-Object System.Windows.Controls.TextBlock
    $t.Text = $text
    $t.Foreground = 'White'
    $t.FontSize = 13
    $t.TextWrapping = 'Wrap'
    $b.Child = $t
    $msgStack.Children.Add($b) | Out-Null
    $scroller.ScrollToBottom()
  })
}

function Ensure-Conversation {
  if ($convId -ne '') { return }
  if ($state.convId -ne '' -and $state.convId -ne $null) {
    $script:convId = $state.convId
    $h = Api-Get ('/api/bots/' + $BotSlug + '/conversations/' + $convId)
    if ($h -and $h.messages) {
      foreach ($m in $h.messages | Select-Object -Last 20) {
        [void]$historyList.Add(@{ role = [string]$m.role; content = [string]$m.content })
        Add-Message $m.role $m.content
      }
      return
    }
    $script:convId = ''
  }
  $c = Api-Post ('/api/bots/' + $BotSlug + '/conversations') @{}
  if ($c -and $c.id) {
    $script:convId = [string]$c.id
    $state.convId = $script:convId
    Save-State
  }
}

function Send-Chat {
  $text = $inputBox.Text.Trim()
  if ($text -eq '' -or $sync.busy) { return }
  if (-not $expanded) { Expand-Island $true }
  Write-BootLog 'send-start'
  $inputBox.Text = ''
  Add-Message 'user' $text
  [void]$historyList.Add(@{ role = 'user'; content = $text })
  $sync.stop = $false
  $sync.busy = $true
  Set-Status 'Thinking' 'thinking'
  $msgs = @()
  foreach ($m in ($historyList | Select-Object -Last 20)) {
    $msgs += @{ role = $m.role; content = $m.content }
  }
  $body = @{ conversation_id = $convId; messages = $msgs } | ConvertTo-Json -Depth 6
  $run = {
    param($sync, $win, $msgStack, $scroller, $headStatus, $stateLine, $pillDot, $ApiBase, $BotSlug, $convId, $body, $Headers)
    try {
      $client = New-Object System.Net.Http.HttpClient
      $client.Timeout = [TimeSpan]::FromSeconds(150)
      foreach ($h in $Headers.Keys) { $client.DefaultRequestHeaders.Add($h, $Headers[$h]) | Out-Null }
      $ct = New-Object System.Net.Http.StringContent($body, [Text.Encoding]::UTF8, 'application/json')
      $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, ($ApiBase + '/api/bots/' + $BotSlug + '/chat'))
      $req.Content = $ct
      $resp = $client.SendAsync($req, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
      if (-not $resp.IsSuccessStatusCode) {
        $win.Dispatcher.Invoke([action]{ $headStatus.Text = 'Error ' + [int]$resp.StatusCode })
        $sync.err = 'Error ' + [int]$resp.StatusCode
        return
      }
      $stream = $resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
      $reader = New-Object System.IO.StreamReader($stream)
      $full = ''
      $win.Dispatcher.Invoke([action]{
        $headStatus.Text = 'Responding'
        $b = New-Object System.Windows.Controls.Border
        $b.CornerRadius = New-Object System.Windows.CornerRadius(12,12,12,4)
        $b.Padding = '10,7'
        $b.Margin = '0,0,0,8'
        $b.MaxWidth = 300
        $b.Background = To-Brush '#131316'
        $b.BorderBrush = To-Brush '#26262c'
        $b.BorderThickness = '1'
        $b.HorizontalAlignment = 'Left'
        $t = New-Object System.Windows.Controls.TextBlock
        $t.Foreground = 'White'
        $t.FontSize = 13
        $t.TextWrapping = 'Wrap'
        $b.Child = $t
        $msgStack.Children.Add($b) | Out-Null
        $scroller.ScrollToBottom()
        $sync.tb = $t
      })
      while (-not $reader.EndOfStream) {
        if ($sync.stop) { break }
        $line = $reader.ReadLine()
        if (-not $line.StartsWith('data:')) { continue }
        $data = $line.Substring(5).Trim()
        if ($data -eq '[DONE]') { continue }
        try { $j = $data | ConvertFrom-Json } catch { continue }
        if ($j.error) {
          $win.Dispatcher.Invoke([action]{ $headStatus.Text = 'Error' })
          $sync.err = [string]$j.error
          break
        }
        if ($j.token) {
          $full += $j.token
          $win.Dispatcher.Invoke([action]{
            $sync.tb.Text = $full
            $scroller.ScrollToBottom()
          })
        }
      }
      $sync.full = $full
    } catch {
      $sync.err = $_.Exception.Message
    } finally {
      $sync.busy = $false
    }
  }
  $ps = [powershell]::Create()
  $ps.AddScript($run).AddArgument($sync).AddArgument($win).AddArgument($msgStack).AddArgument($scroller).AddArgument($headStatus).AddArgument($stateLine).AddArgument($pillDot).AddArgument($ApiBase).AddArgument($BotSlug).AddArgument($convId).AddArgument($body).AddArgument($Headers) | Out-Null
  $handle = $ps.BeginInvoke()
  Write-BootLog 'sent-launched'
  $timer = New-Object System.Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromMilliseconds(400)
  $timer.Add_Tick({
    if ($handle.AsyncWaitHandle.WaitOne(0)) {
      $timer.Stop()
      Write-BootLog 'tick-fired'
      try { $ps.EndInvoke($handle) | Out-Null } catch { Write-BootLog ('endinvoke-fail: ' + $_.Exception.Message) }
      $ps.Dispose()
      Write-BootLog 'tick-done'
      if ($sync.err -ne $null -and $sync.err -ne '') {
        Set-Status 'Error' 'attention'
        $sync.err = ''
      } else {
        [void]$historyList.Add(@{ role = 'assistant'; content = [string]$sync.full })
        Set-Status 'Idle' 'idle'
        try { Speak ([string]$sync.full) } catch {}
      }
    }
  })
  $timer.Start()
}

function Start-Listen {
  if (-not $state.stt) {
    Set-Status 'Enable voice input in Bot settings first' 'attention'
    return
  }
  Set-Status 'Listening' 'listening'
  $run = {
    param($sync)
    try {
      $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
      $rec.SetInputToDefaultAudioDevice()
      $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
      $res = $rec.Recognize([TimeSpan]::FromSeconds(10))
      if ($res -and $res.Text) { $sync.heard = $res.Text }
      else { $sync.heard = '' }
      $rec.Dispose()
    } catch {
      $sync.heard = '__unavailable__'
    }
  }
  $ps = [powershell]::Create()
  $ps.AddScript($run).AddArgument($sync) | Out-Null
  $h = $ps.BeginInvoke()
  $timer = New-Object System.Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromMilliseconds(300)
  $timer.Add_Tick({
    if ($h.AsyncWaitHandle.WaitOne(0)) {
      $timer.Stop()
      try { $ps.EndInvoke($h) | Out-Null } catch {}
      $ps.Dispose()
      $heard = [string]$sync.heard
      $sync.heard = ''
      if ($heard -eq '__unavailable__') {
        Set-Status 'Voice input unavailable on this PC' 'attention'
      } elseif ($heard -ne '') {
        $inputBox.Text = $heard
        Set-Status 'Idle' 'idle'
        Send-Chat
      } else {
        Set-Status 'Idle' 'idle'
      }
    }
  })
  $timer.Start()
}

function Build-Island {
  $r = New-Object System.Xml.XmlNodeReader $islandXaml
  $script:win = [Windows.Markup.XamlReader]::Load($r)
  $script:island = $win.FindName('Island')
  $script:island = $win.FindName('Island')
  $script:pillRow = $win.FindName('PillRow')
  $script:avatarWrap = $win.FindName('AvatarWrap')
  $script:avatarRing = $win.FindName('AvatarRing')
  $script:avatarFace = $win.FindName('AvatarFace')
  $script:avatarBrush = $null
  $script:avatarFallback = $win.FindName('AvatarFallback')
  $script:pillName = $win.FindName('PillName')
  $script:pillDot = $win.FindName('PillDot')
  $script:chevron = $win.FindName('Chevron')
  $script:chatArea = $win.FindName('ChatArea')
  $script:headStatus = $win.FindName('HeadStatus')
  $script:msgStack = $win.FindName('Messages')
  $script:scroller = $win.FindName('Scroller')
  $script:stateLine = $win.FindName('StateLine')
  $script:inputBox = $win.FindName('Input')
  $pillName.Text = $BotName
  $ph0 = $state.size
  if (-not $ph0) { $ph0 = $PillH }
  Apply-IslandSize $ph0
  if ((Test-Path $AvatarFile)) {
    try {
      $img = New-Object System.Windows.Media.Imaging.BitmapImage
      $img.BeginInit(); $img.UriSource = $AvatarFile; $img.CacheOption = 'OnLoad'; $img.EndInit()
      $br = New-Object System.Windows.Media.ImageBrush
      $br.ImageSource = $img
      $br.Stretch = 'UniformToFill'
      $avatarFace.Fill = $br
      $script:avatarBrush = $br
    } catch {
      $avatarFallback.Text = $BotName.Substring(0, 1).ToUpper()
      $avatarFallback.Visibility = 'Visible'
    }
  } else {
    $avatarFallback.Text = $BotName.Substring(0, 1).ToUpper()
    $avatarFallback.Visibility = 'Visible'
  }
  $win.Topmost = [bool]$state.top
  $win.Add_KeyDown({
    param($s, $e)
    if ($e.Key -eq 'Escape') { Collapse-Island }
  })

  # click pill toggles
  $pillRow.Add_MouseLeftButtonDown({
    $script:pressX = [System.Windows.Input.Mouse]::GetPosition($win).X
    $script:pressMoved = $false
    $pillRow.CaptureMouse() | Out-Null
  })
  $pillRow.Add_MouseMove({
    if ($pressX -eq $null) { return }
    $p = [System.Windows.Input.Mouse]::GetPosition($win)
    $dx = $p.X - $pressX
    if ([Math]::Abs($dx) -gt 5) { $pressMoved = $true }
    if ($pressMoved -and -not $expanded) {
      $cx = Screen-CenterX
      if (-not $cx) { $cx = [System.Windows.SystemParameters]::PrimaryScreenWidth / 2 }
      $sw = [System.Windows.SystemParameters]::PrimaryScreenWidth
      $newCx = $cx + $dx
      $half = $win.Width / 2
      if ($newCx -lt ($half + 8)) { $newCx = $half + 8 }
      if ($newCx -gt ($sw - $half - 8)) { $newCx = $sw - $half - 8 }
      $win.Left = $newCx - $half
    }
  })
  $pillRow.Add_MouseLeftButtonUp({
    try { $pillRow.ReleaseMouseCapture() | Out-Null } catch {}
    if ($pressMoved) {
      $state.x = [int]($win.Left + ($win.Width / 2) - ([System.Windows.SystemParameters]::PrimaryScreenWidth / 2))
      Save-State
      Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ x = $state.x } | Out-Null
    } else {
      Toggle-Island
    }
    $script:pressX = $null
    $script:pressMoved = $false
  })

  # header drag moves island horizontally too
  $head = $win.FindName('HeadDrag')
  if ($head) {
    $head.Add_MouseLeftButtonDown({ $win.DragMove() })
  }

  # right-click menu
  $win.Add_MouseRightButtonUp({
    $menu = New-Object System.Windows.Controls.ContextMenu
    $sizes = @(
      @{ h = 'Compact'; s = 56 },
      @{ h = 'Comfortable'; s = 72 },
      @{ h = 'Large'; s = 88 }
    )
    foreach ($sz in $sizes) {
      $mi = New-Object System.Windows.Controls.MenuItem
      $mi.Header = $sz.h
      $mi.Tag = $sz.s
      $mi.Add_Click({
        param($s, $e)
        $ns = [int]$s.Tag
        $state.size = $ns
        Save-State
        Apply-IslandSize $ns
        if (-not $expanded) { Place-Island $PillW $ns }
        Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ size = $ns } | Out-Null
      })
      $menu.Items.Add($mi) | Out-Null
    }
    $sep = New-Object System.Windows.Controls.Separator
    $menu.Items.Add($sep) | Out-Null
    $pinLabel = 'Pin above windows'
    if ($win.Topmost) { $pinLabel = 'Unpin' }
    $pin = New-Object System.Windows.Controls.MenuItem
    $pin.Header = $pinLabel
    $pin.Add_Click({
      $win.Topmost = -not $win.Topmost
      $state.top = [bool]$win.Topmost
      Save-State
      Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ always_on_top = $state.top } | Out-Null
    })
    $menu.Items.Add($pin) | Out-Null
    $page = New-Object System.Windows.Controls.MenuItem
    $page.Header = 'Open full page'
    $page.Add_Click({ Start-Process ($ApiBase + '/bot/' + $BotSlug) })
    $menu.Items.Add($page) | Out-Null
    $hide = New-Object System.Windows.Controls.MenuItem
    $hide.Header = 'Hide'
    $hide.Add_Click({ Hide-Island })
    $menu.Items.Add($hide) | Out-Null
    $quit = New-Object System.Windows.Controls.MenuItem
    $quit.Header = 'Quit'
    $quit.Add_Click({ [System.Windows.Application]::Current.Shutdown() })
    $menu.Items.Add($quit) | Out-Null
    $menu.PlacementTarget = $win
    $menu.IsOpen = $true
  })

  $win.FindName('BtnX').Add_Click({ Collapse-Island })
  $win.FindName('BtnPin').Add_Click({
    $win.Topmost = -not $win.Topmost
    $state.top = [bool]$win.Topmost
    Save-State
    Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ always_on_top = $state.top } | Out-Null
  })
  $win.FindName('BtnPage').Add_Click({ Start-Process ($ApiBase + '/bot/' + $BotSlug) })
  $win.FindName('BtnSend').Add_Click({ Send-Chat })
  $win.FindName('BtnMic').Add_Click({ Start-Listen })
  $spk = $win.FindName('BtnSpeak')
  $spk.Opacity = if ($state.tts) { 1.0 } else { 0.45 }
  $spk.Add_Click({
    $state.tts = -not $state.tts
    Save-State
    $spk.Opacity = if ($state.tts) { 1.0 } else { 0.45 }
    if (-not $state.tts -and $speaker) { try { $speaker.SpeakAsyncCancelAll() | Out-Null } catch {} }
  })
  $inputBox.Add_KeyDown({
    param($s, $e)
    if ($e.Key -eq 'Enter') { Send-Chat }
  })
}

# ---------- boot (skipped when dot-sourced for testing) ----------
if ($env:HUMANBOT_TEST -ne '1') {
$prof = Api-Get ('/api/bots/' + $BotSlug + '/companion')
if (-not $prof) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show('Could not reach Human AI. Check the Desktop key and that the server is running.', 'Human Bot Desktop') | Out-Null
  exit
}
if ($prof.bot -and $prof.bot.companion -and $prof.bot.companion.enabled -eq $false) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show('Desktop is disabled for this Bot. Enable it on the Bot Desktop page.', 'Human Bot Desktop') | Out-Null
  exit
}
Write-BootLog 'api-ok'
Build-Island
Write-BootLog 'build-ok'
$sz = $state.size
if (-not $sz) { $sz = $PillH }
Apply-IslandSize $sz
if ($state.hidden) {
  Place-Island $PillW $sz
  Hide-Island
} else {
  Place-Island $PillW $sz
}
$win.Show()
Write-BootLog 'shown'
if (-not $state.collapsed) {
  Expand-Island $true
}
Write-BootLog 'running'
[System.Windows.Application]::new().Run() | Out-Null
}
`;
  return script
    .replace(/__NAME__/g, c.name.replace(/"/g, ""))
    .replace(/__ACCENT__/g, accent)
    .replace(/__PILLH__/g, String(pillH));
}
