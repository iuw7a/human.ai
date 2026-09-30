/** Builds the Human Bot Desktop companion (.ps1) — Dynamic Island edition.
 *  Premium floating-island language (matches the Human AI web interface):
 *  small top-center pill (avatar + live status + dot) that spring-expands
 *  into a chat panel with floating message cards, task cards and a large
 *  rounded composer. PowerShell 5.1 safe. States: idle/thinking/responding/
 *  listening/speaking/working/done/attention. Position persisted; autostart
 *  via companion .cmd.
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
  if (-not $state.tts) { return '' }
  if (-not $speaker) { return '' }
  $t = [string]$text
  if ($t -eq '') { return '' }
  try { $speaker.SpeakAsyncCancelAll() | Out-Null; $speaker.SpeakAsync($t) | Out-Null; return 'speaking' } catch { return '' }
}

# ---------- island window ----------
[xml]$islandXaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
  WindowStyle="None" AllowsTransparency="True" Background="Transparent"
  ShowInTaskbar="False" Title="__NAME__">
  <Border Name="Island" CornerRadius="28" Background="#0C0C10F2"
    BorderBrush="#26262C" BorderThickness="1">
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
        <StackPanel Grid.Column="1" Margin="9,0,0,0" VerticalAlignment="Center">
          <TextBlock Name="PillName" Foreground="White" FontWeight="SemiBold" FontSize="13" TextTrimming="CharacterEllipsis" />
          <TextBlock Name="PillSub" Foreground="#71717a" FontSize="10" Text="Ask for anything…" TextTrimming="CharacterEllipsis" />
        </StackPanel>
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
        <Border Grid.Row="0" Background="#00000000" Padding="0,16,0,8" Name="HeadDrag">
          <StackPanel HorizontalAlignment="Center">
            <Border Width="96" Height="88" CornerRadius="26" Background="#050506"
              BorderBrush="#26262C" BorderThickness="1" HorizontalAlignment="Center">
              <Canvas>
                <Ellipse Name="EyeL" Canvas.Left="22" Canvas.Top="26" Width="20" Height="30" Fill="White" />
                <Ellipse Name="EyeR" Canvas.Left="54" Canvas.Top="26" Width="20" Height="30" Fill="White" />
                <Path Stroke="White" StrokeThickness="2.5" Data="M 38,62 Q 48,69 58,62" />
              </Canvas>
            </Border>
            <TextBlock Name="HeadStatus" Foreground="#a1a1aa" FontSize="11" Text="Idle"
              HorizontalAlignment="Center" Margin="0,8,0,0" />
            <TextBlock Name="HeadBotName" Visibility="Collapsed" />
          </StackPanel>
        </Border>
        <ScrollViewer Grid.Row="1" Margin="12,0" Name="Scroller" VerticalScrollBarVisibility="Auto">
          <StackPanel Name="Messages" />
        </ScrollViewer>
        <TextBlock Grid.Row="1" Name="HintLine" Foreground="#52525b" FontSize="13"
          HorizontalAlignment="Center" VerticalAlignment="Center" Text="Ask for anything…" IsHitTestVisible="False" />
        <TextBlock Grid.Row="2" Name="StateLine" Foreground="#71717a" FontSize="11" Margin="14,2" Text="" Visibility="Collapsed" />
        <Border Grid.Row="3" Margin="12,6,12,12" CornerRadius="22" Background="#050506"
          BorderBrush="#26262C" BorderThickness="1" Padding="14,10">
          <StackPanel>
            <DockPanel Margin="2,0,2,8" LastChildFill="True">
              <TextBlock Text="Plan" Foreground="#71717a" FontSize="11" Margin="0,0,8,0" VerticalAlignment="Center" />
              <TextBlock Name="PlanLine" Foreground="White" FontSize="12" Text="Nothing planned soon" TextTrimming="CharacterEllipsis" VerticalAlignment="Center" />
            </DockPanel>
            <Grid>
              <Grid.ColumnDefinitions>
                <ColumnDefinition Width="*" />
                <ColumnDefinition Width="Auto" />
                <ColumnDefinition Width="Auto" />
              </Grid.ColumnDefinitions>
              <TextBox Name="Input" Grid.Column="0" Background="Transparent" Foreground="White"
                BorderThickness="0" Padding="2,6" FontSize="14" CaretBrush="White"
                VerticalContentAlignment="Center" />
              <Button Name="BtnMic" Grid.Column="1" Content="Mic" ToolTip="Voice input" Margin="8,0,0,0" FontSize="10"
                Background="#1C1C22" Foreground="White" BorderThickness="0" Width="34" Height="34" Cursor="Hand">
                <Button.Resources><Style TargetType="Border"><Setter Property="CornerRadius" Value="17" /></Style></Button.Resources>
              </Button>
              <Button Name="BtnGrid" Grid.Column="2" Content="▦" ToolTip="Menu" Margin="8,0,0,0" FontSize="14"
                Background="#1C1C22" Foreground="White" BorderThickness="0" Width="34" Height="34" Cursor="Hand">
                <Button.Resources><Style TargetType="Border"><Setter Property="CornerRadius" Value="17" /></Style></Button.Resources>
              </Button>
            </Grid>
          </StackPanel>
        </Border>
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
$pillSub = $null
$pillDot = $null
$headBotName = $null
$eyeL = $null
$eyeR = $null
$planLine = $null
$openTasks = @()
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
$lastPillSub = $null
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
    # Collapsed pill mirrors the live status; restore the previous
    # pill line (task hint) once the turn is over.
    if ($botState -eq 'idle' -or $botState -eq 'done') {
      if ($script:lastPillSub -ne $null -and $script:lastPillSub -ne '') { $pillSub.Text = $script:lastPillSub }
      $script:lastPillSub = $null
    } elseif ($script:lastPillSub -eq $null) {
      $script:lastPillSub = $pillSub.Text
      $pillSub.Text = $text
    } else {
      $pillSub.Text = $text
    }
    if ($botState -eq 'listening') { $pillDot.Fill = To-Brush '#10b981' }
    elseif ($botState -eq 'thinking' -or $botState -eq 'responding') { $pillDot.Fill = To-Brush '#e5484d' }
    elseif ($botState -eq 'speaking') { $pillDot.Fill = To-Brush '#e5484d' }
    elseif ($botState -eq 'working') { $pillDot.Fill = To-Brush '#f59e0b' }
    elseif ($botState -eq 'done') { $pillDot.Fill = To-Brush '#34d399' }
    elseif ($botState -eq 'attention') { $pillDot.Fill = To-Brush '#e5484d' }
    else { $pillDot.Fill = To-Brush '#10b981' }
  })
  if ($botState -eq 'thinking' -or $botState -eq 'responding' -or $botState -eq 'working' -or $botState -eq 'speaking') {
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

# mascot blink: briefly narrow the eyes every few seconds while expanded
$blinkShut = New-Object System.Windows.Threading.DispatcherTimer
$blinkShut.Interval = [TimeSpan]::FromMilliseconds(150)
$blinkShut.Add_Tick({
  $blinkShut.Stop()
  try {
    $eyeL.Height = 30
    $eyeR.Height = 30
    $eyeL.SetValue([System.Windows.Controls.Canvas]::TopProperty, 26.0)
    $eyeR.SetValue([System.Windows.Controls.Canvas]::TopProperty, 26.0)
  } catch {}
})
$blinkTimer = New-Object System.Windows.Threading.DispatcherTimer
$blinkTimer.Interval = [TimeSpan]::FromMilliseconds(3400)
$blinkTimer.Add_Tick({
  if (-not $expanded) { return }
  try {
    $eyeL.Height = 4
    $eyeR.Height = 4
    $eyeL.SetValue([System.Windows.Controls.Canvas]::TopProperty, 39.0)
    $eyeR.SetValue([System.Windows.Controls.Canvas]::TopProperty, 39.0)
    $blinkShut.Start()
  } catch {}
})
$blinkTimer.Start()

$dotsTimer = New-Object System.Windows.Threading.DispatcherTimer
$dotsTimer.Interval = [TimeSpan]::FromMilliseconds(380)
$dotsN = 0
$waveFrames = @('|', '||', '|||', '||||', '|||', '||')
$waveN = 0
$dotsTimer.Add_Tick({
  if ($script:uiState -eq 'listening') {
    $waveN = ($waveN + 1) % $waveFrames.Count
    $w = $waveFrames[$waveN]
    $headStatus.Text = $w + ' Listening...'
    $stateLine.Text = $w + ' Listening... — tap Mic to stop'
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

# "Done" flash after a finished turn (speaking time is estimated from
# the reply length so the pill reads Speaking... while TTS talks).
$doneTimer = New-Object System.Windows.Threading.DispatcherTimer
$doneTimer.Add_Tick({
  $doneTimer.Stop()
  if ($script:uiState -eq 'speaking') {
    Set-Status 'Done' 'done'
    $doneTimer.Interval = [TimeSpan]::FromMilliseconds(1800)
    $doneTimer.Start()
  } else {
    Set-Status 'Idle' 'idle'
  }
})
function Flash-Done($extraSecs) {
  try { $doneTimer.Stop() } catch {}
  $ms = 1800 + ([int]$extraSecs * 1000)
  $doneTimer.Interval = [TimeSpan]::FromMilliseconds($ms)
  $doneTimer.Start()
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
    Start-Anim $PanelW $PanelH 300 'back' $null
  }
  $state.collapsed = $false
  Save-State
  Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ collapsed = $false } | Out-Null
  Ensure-Conversation
  Refresh-Tasks
  $inputBox.Focus() | Out-Null
}

$taskTimer = New-Object System.Windows.Threading.DispatcherTimer
$taskTimer.Interval = [TimeSpan]::FromMinutes(1)
$taskTimer.Add_Tick({
  try {
    Refresh-Tasks
    Check-DueTasks
  } catch {}
})

function Collapse-Island {
  if (-not $expanded) { return }
  $script:expanded = $false
  $chevron.Text = 'v'
  $ph = $pillCurH
  if (-not $ph) { $ph = $PillH }
  Start-Anim $PillW $ph 220 'in' {
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
    if ($role -eq 'user') { $b.CornerRadius = New-Object System.Windows.CornerRadius(18,18,6,18) } else { $b.CornerRadius = New-Object System.Windows.CornerRadius(18,18,18,6) }
    $b.Padding = '12,10'
    $b.Margin = '0,0,0,8'
    $b.MaxWidth = 312
    if ($role -eq 'user') {
      $b.Background = To-Brush '#15151B'
      $b.BorderBrush = To-Brush '#2E2E35'
      $b.BorderThickness = '1'
      $b.HorizontalAlignment = 'Right'
    } else {
      $b.Background = To-Brush '#101014'
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
  Write-BootLog 'm-clear'
  Add-Message 'user' $text
  Write-BootLog 'm-appended'
  [void]$historyList.Add(@{ role = 'user'; content = $text })
  $sync.stop = $false
  $sync.busy = $true
  Set-Status 'Thinking...' 'thinking'
  Write-BootLog 'm-status'
  $msgs = @()
  foreach ($m in ($historyList | Select-Object -Last 20)) {
    $msgs += @{ role = $m.role; content = $m.content }
  }
  $body = @{ conversation_id = $convId; messages = $msgs } | ConvertTo-Json -Depth 6
  $botBg = To-Brush '#101014'
  $botBd = To-Brush '#26262c'
  try { $botBg.Freeze(); $botBd.Freeze() } catch {}
  Write-BootLog 'm-body'
  $run = {
    param($sync, $win, $msgStack, $scroller, $headStatus, $stateLine, $pillDot, $ApiBase, $BotSlug, $convId, $body, $Headers, $bgBrush, $bdBrush)
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
        $headStatus.Text = 'Generating...'
        $b = New-Object System.Windows.Controls.Border
        $b.CornerRadius = New-Object System.Windows.CornerRadius(18,18,18,6)
        $b.Padding = '12,10'
        $b.Margin = '0,0,0,8'
        $b.MaxWidth = 312
        $b.Background = $bgBrush
        $b.BorderBrush = $bdBrush
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
          $sync.full = $full
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
  $script:sendPs = [powershell]::Create()
  $script:sendPs.AddScript($run).AddArgument($sync).AddArgument($win).AddArgument($msgStack).AddArgument($scroller).AddArgument($headStatus).AddArgument($stateLine).AddArgument($pillDot).AddArgument($ApiBase).AddArgument($BotSlug).AddArgument($convId).AddArgument($body).AddArgument($Headers).AddArgument($botBg).AddArgument($botBd) | Out-Null
  Write-BootLog 'm-args'
  $script:sendHandle = $script:sendPs.BeginInvoke()
  Write-BootLog 'sent-launched'
  if ($script:sendTimer) { try { $script:sendTimer.Stop() } catch {} }
  $script:sendTimer = New-Object System.Windows.Threading.DispatcherTimer
  $script:sendTimer.Interval = [TimeSpan]::FromMilliseconds(400)
  $script:sendTimer.Add_Tick({
    try {
      if ($script:uiState -eq 'thinking' -and $sync.full -ne $null -and [string]$sync.full -ne '') {
        Set-Status 'Generating...' 'responding'
      }
      if ($script:sendHandle.AsyncWaitHandle.WaitOne(0)) {
        $script:sendTimer.Stop()
        Write-BootLog 'tick-fired'
        try { $script:sendPs.EndInvoke($script:sendHandle) | Out-Null } catch { Write-BootLog ('endinvoke-fail: ' + $_.Exception.Message) }
        $script:sendPs.Dispose()
        Write-BootLog 'tick-done'
      if ($sync.err -ne $null -and $sync.err -ne '') {
        Write-BootLog ('reply-err-full: ' + [string]$sync.err)
        $short = [string]$sync.err
        if ($short.Length -gt 90) { $short = $short.Substring(0, 90) + '…' }
        Set-Status ('Error: ' + $short) 'attention'
        $sync.err = ''
      } else {
        [void]$historyList.Add(@{ role = 'assistant'; content = [string]$sync.full })
        $said = ''
        try { $said = Speak ([string]$sync.full) } catch {}
        if ($said -eq 'speaking') {
          $secs = 4
          try {
            $wc = ([regex]::Matches([string]$sync.full, '\S+')).Count
            $secs = [Math]::Min(25, [Math]::Max(3, [int]($wc / 2.5)))
          } catch {}
          Set-Status 'Speaking...' 'speaking'
          Flash-Done $secs
        } else {
          Set-Status 'Done' 'done'
          Flash-Done 0
        }
      }
    }
    } catch {
      Write-BootLog ('tick-catch: ' + $_.Exception.Message)
    }
  })
  $script:sendTimer.Start()
}

function Start-Listen {
  if (-not $state.stt) {
    Set-Status 'Enable voice input in Bot settings first' 'attention'
    return
  }
  Set-Status 'Listening...' 'listening'
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
  $script:listenPs = [powershell]::Create()
  $script:listenPs.AddScript($run).AddArgument($sync) | Out-Null
  $script:listenHandle = $script:listenPs.BeginInvoke()
  if ($script:listenTimer) { try { $script:listenTimer.Stop() } catch {} }
  $script:listenTimer = New-Object System.Windows.Threading.DispatcherTimer
  $script:listenTimer.Interval = [TimeSpan]::FromMilliseconds(300)
  $script:listenTimer.Add_Tick({
    try {
      if ($script:listenHandle.AsyncWaitHandle.WaitOne(0)) {
        $script:listenTimer.Stop()
        try { $script:listenPs.EndInvoke($script:listenHandle) | Out-Null } catch { Write-BootLog ('listen-endinvoke-fail: ' + $_.Exception.Message) }
        $script:listenPs.Dispose()
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
    } catch {
      Write-BootLog ('listen-tick-catch: ' + $_.Exception.Message)
    }
  })
  $script:listenTimer.Start()
}

function Refresh-Tasks {
  try {
    $t = Api-Get ('/api/bots/' + $BotSlug + '/tasks')
    if (-not $t -or -not $t.tasks) { return }
    $script:openTasks = @($t.tasks | Where-Object { -not $_.done })
    $n = $script:openTasks.Count
    $plan = 'Nothing planned soon'
    if ($n -gt 0) {
      $withDue = @($script:openTasks | Where-Object { $_.due_at } | Select-Object -First 1)
      if ($withDue.Count -gt 0) {
        $dt = [string]$withDue[0].title
        $plan = $dt.Substring(0, [Math]::Min(40, $dt.Length))
      } else {
        $ft = [string]$script:openTasks[0].title
        $plan = $ft.Substring(0, [Math]::Min(40, $ft.Length))
      }
      if ($n -gt 1) { $plan = $plan + ' (+' + ($n - 1) + ' more)' }
    }
    $win.Dispatcher.Invoke([action]{
      $planLine.Text = $plan
      if ($script:uiState -eq 'idle' -or $script:uiState -eq 'done' -or $script:uiState -eq $null -or $script:uiState -eq '') {
        if ($n -gt 0) { $pillSub.Text = $plan } else { $pillSub.Text = 'Ask for anything…' }
      }
    })
  } catch {}
}

function Check-DueTasks {
  try {
    $t = Api-Get ('/api/bots/' + $BotSlug + '/tasks')
    if (-not $t -or -not $t.tasks) { return }
    $now = Get-Date
    foreach ($task in @($t.tasks)) {
      if ($task.done -or $task.notified -or -not $task.due_at) { continue }
      try { $due = [DateTime]$task.due_at } catch { continue }
      if ($due -le $now) {
        Api-Patch ('/api/bots/' + $BotSlug + '/tasks') @{ id = [string]$task.id; notified = $true } | Out-Null
        Set-Status 'Reminder' 'attention'
        Notify-Attention
        try { Speak ('Reminder: ' + [string]$task.title) } catch {}
      }
    }
  } catch {}
}

function Add-TaskFromInput {
  $title = $inputBox.Text.Trim()
  if ($title -eq '') {
    Set-Status 'Type a task title first' 'attention'
    return
  }
  $created = Api-Post ('/api/bots/' + $BotSlug + '/tasks') @{ title = $title }
  if ($created -and $created.task) {
    $inputBox.Text = ''
    Refresh-Tasks
    Set-Status 'Task added' 'done'
    Flash-Done 0
  } else {
    Set-Status 'Could not add task' 'attention'
  }
}

function Build-Island {
  $r = New-Object System.Xml.XmlNodeReader $islandXaml
  $script:win = [Windows.Markup.XamlReader]::Load($r)
  $script:island = $win.FindName('Island')
  $script:pillRow = $win.FindName('PillRow')
  $script:avatarWrap = $win.FindName('AvatarWrap')
  $script:avatarRing = $win.FindName('AvatarRing')
  $script:avatarFace = $win.FindName('AvatarFace')
  $script:avatarBrush = $null
  $script:avatarFallback = $win.FindName('AvatarFallback')
  $script:pillName = $win.FindName('PillName')
  $script:pillSub = $win.FindName('PillSub')
  $script:headBotName = $win.FindName('HeadBotName')
  $script:eyeL = $win.FindName('EyeL')
  $script:eyeR = $win.FindName('EyeR')
  $script:planLine = $win.FindName('PlanLine')
  $script:pillDot = $win.FindName('PillDot')
  $script:chevron = $win.FindName('Chevron')
  $script:chatArea = $win.FindName('ChatArea')
  $script:headStatus = $win.FindName('HeadStatus')
  $script:msgStack = $win.FindName('Messages')
  $script:scroller = $win.FindName('Scroller')
  $script:stateLine = $win.FindName('StateLine')
  $script:inputBox = $win.FindName('Input')
  $pillName.Text = $BotName
  $headBotName.Text = $BotName
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

  # grid menu (also on right-click): sizes, pin, full page, voice, tasks, hide, quit
  function Show-Menu {
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
    $ttsLabel = 'Read aloud: off'
    if ($state.tts) { $ttsLabel = 'Read aloud: on' }
    $ttsItem = New-Object System.Windows.Controls.MenuItem
    $ttsItem.Header = $ttsLabel
    $ttsItem.Add_Click({
      $state.tts = -not $state.tts
      Save-State
      if (-not $state.tts -and $speaker) { try { $speaker.SpeakAsyncCancelAll() | Out-Null } catch {} }
    })
    $menu.Items.Add($ttsItem) | Out-Null
    $addT = New-Object System.Windows.Controls.MenuItem
    $addT.Header = 'Add input as task'
    $addT.Add_Click({ Add-TaskFromInput })
    $menu.Items.Add($addT) | Out-Null
    $coll = New-Object System.Windows.Controls.MenuItem
    $coll.Header = 'Collapse'
    $coll.Add_Click({ Collapse-Island })
    $menu.Items.Add($coll) | Out-Null
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
  }
  $win.Add_MouseRightButtonUp({ Show-Menu })

  $win.FindName('BtnMic').Add_Click({ Start-Listen })
  $win.FindName('BtnGrid').Add_Click({ Show-Menu })
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
$taskTimer.Start()
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
