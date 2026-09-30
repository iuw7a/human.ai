/** Builds the Human Bot Desktop companion (.ps1) for a bot.
 *  WPF floating avatar (draggable, resizable, always-on-top) + chat panel
 *  talking to Human AI via the bot's companion API key. PowerShell 5.1 safe.
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
  const size = Math.min(160, Math.max(48, Math.round(c.size) || 72));
  const script = `@'
# ============================================================
# Human Bot Desktop companion
# Bot: ${c.slug}  Server: ${c.apiBase}
# Run: powershell -ExecutionPolicy Bypass -File <this>.ps1
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'

$ApiBase = ${q(c.apiBase)}
$BotSlug = ${q(c.slug)}
$BotName = ${q(c.name)}
$AvatarUrl = ${q(c.avatarUrl ?? "")}
$Accent = ${q(accent)}
$DefaultSize = ${size}
$DefaultTop = ${c.alwaysOnTop ? "$true" : "$false"}
$DefaultTts = ${c.tts ? "$true" : "$false"}
$DefaultStt = ${c.stt ? "$true" : "$false"}

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Xaml
Add-Type -AssemblyName System.Speech

$StateDir = Join-Path $env:APPDATA 'HumanAI\\bots'
if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Path $StateDir -Force | Out-Null }
$StateFile = Join-Path $StateDir ($BotSlug + '.json')
$AvatarFile = Join-Path $env:TEMP ('humanbot-' + $BotSlug + '.png')

$state = $null
if (Test-Path $StateFile) {
  try { $state = Get-Content $StateFile -Raw | ConvertFrom-Json } catch { $state = $null }
}
if (-not $state) {
  $state = [pscustomobject]@{ apiKey = ''; convId = ''; x = $null; y = $null; size = $DefaultSize; top = $DefaultTop; tts = $DefaultTts; stt = $DefaultStt }
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

# ---------- avatar image ----------
if ($AvatarUrl -ne '' -and -not (Test-Path $AvatarFile)) {
  try { Invoke-WebRequest -Uri $AvatarUrl -OutFile $AvatarFile -TimeoutSec 20 } catch {}
}

# ---------- shared ----------
$sync = [hashtable]::Synchronized(@{ stop = $false; busy = $false })
$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromSeconds(120)
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

# ---------- TTS ----------
$speaker = $null
try { $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer } catch {}
function Speak($text) {
  if (-not $state.tts) { return }
  if (-not $speaker) { return }
  try { $speaker.SpeakAsyncCancelAll() | Out-Null; $speaker.SpeakAsync($text) | Out-Null } catch {}
}

# ---------- avatar window ----------
[xml]$avatarXaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
  WindowStyle="None" AllowsTransparency="True" Background="Transparent"
  ShowInTaskbar="False" Width="__SIZE__" Height="__SIZE__" Title="__NAME__">
  <Grid>
    <Ellipse Name="Ring" Stroke="__ACCENT__" StrokeThickness="3" Margin="3" Opacity="0.9" />
    <Ellipse Margin="8">
      <Ellipse.Fill>
        <ImageBrush Name="AvatarBrush" Stretch="UniformToFill" />
      </Ellipse.Fill>
    </Ellipse>
    <TextBlock Name="Fallback" Foreground="White" FontWeight="Bold" FontSize="22"
      HorizontalAlignment="Center" VerticalAlignment="Center" Visibility="Collapsed" />
    <Ellipse Name="Dot" Width="11" Height="11" Fill="#10b981" Margin="0,0,6,6"
      HorizontalAlignment="Right" VerticalAlignment="Bottom" />
    <Border Name="Grip" Width="16" Height="16" Background="#00000000"
      HorizontalAlignment="Right" VerticalAlignment="Bottom" Cursor="SizeNWSE" />
  </Grid>
</Window>
"@

$avatarWin = $null
$ring = $null
$dot = $null
$brush = $null
$fallback = $null

function Set-State($s) {
  if (-not $avatarWin) { return }
  $avatarWin.Dispatcher.Invoke([action]{
    if ($s -eq 'listening') { $ring.Stroke = '#10b981'; $dot.Fill = '#10b981'; }
    elseif ($s -eq 'thinking' -or $s -eq 'responding') { $ring.Stroke = $Accent; $dot.Fill = '#e5484d' }
    elseif ($s -eq 'working') { $ring.Stroke = '#f59e0b'; $dot.Fill = '#f59e0b' }
    elseif ($s -eq 'attention') { $ring.Stroke = '#e5484d'; $ring.StrokeThickness = 5; $dot.Fill = '#e5484d' }
    else { $ring.Stroke = $Accent; $ring.StrokeThickness = 3; $dot.Fill = '#10b981' }
  })
}

function Show-Avatar {
  $r = New-Object System.Xml.XmlNodeReader $avatarXaml
  $script:avatarWin = [Windows.Markup.XamlReader]::Load($r)
  $script:ring = $avatarWin.FindName('Ring')
  $script:dot = $avatarWin.FindName('Dot')
  $script:brush = $avatarWin.FindName('AvatarBrush')
  $script:fallback = $avatarWin.FindName('Fallback')
  if ((Test-Path $AvatarFile)) {
    try {
      $img = New-Object System.Windows.Media.Imaging.BitmapImage
      $img.BeginInit(); $img.UriSource = $AvatarFile; $img.CacheOption = 'OnLoad'; $img.EndInit()
      $brush.ImageSource = $img
    } catch { $fallback.Text = $BotName.Substring(0, 1).ToUpper(); $fallback.Visibility = 'Visible' }
  } else {
    $fallback.Text = $BotName.Substring(0, 1).ToUpper(); $fallback.Visibility = 'Visible'
  }
  $sz = $state.size
  if (-not $sz) { $sz = $DefaultSize }
  $avatarWin.Width = $sz; $avatarWin.Height = $sz
  if ($state.x -ne $null -and $state.y -ne $null) {
    $avatarWin.Left = $state.x; $avatarWin.Top = $state.y
  } else {
    $sw = [System.Windows.SystemParameters]::PrimaryScreenWidth
    $sh = [System.Windows.SystemParameters]::PrimaryScreenHeight
    $avatarWin.Left = $sw - $sz - 32; $avatarWin.Top = $sh - $sz - 90
  }
  $avatarWin.Topmost = [bool]$state.top

  # drag avatar
  $drag = @{ on = $false; sx = 0; sy = 0; lx = 0; ly = 0; moved = $false }
  $avatarWin.Add_MouseLeftButtonDown({
    $drag.on = $true; $drag.moved = $false
    $p = [System.Windows.Input.Mouse]::GetPosition($avatarWin)
    $drag.sx = $p.X; $drag.sy = $p.Y; $drag.lx = $avatarWin.Left; $drag.ly = $avatarWin.Top
    $avatarWin.CaptureMouse() | Out-Null
  })
  $avatarWin.Add_MouseMove({
    if ($drag.on) {
      $p = [System.Windows.Input.Mouse]::GetPosition($avatarWin)
      $dx = $p.X - $drag.sx; $dy = $p.Y - $drag.sy
      if ([Math]::Abs($dx) + [Math]::Abs($dy) -gt 4) { $drag.moved = $true }
      if ($drag.moved) { $avatarWin.Left = $drag.lx + $dx; $avatarWin.Top = $drag.ly + $dy }
    }
  })
  $avatarWin.Add_MouseLeftButtonUp({
    $wasDrag = $drag.moved
    $drag.on = $false
    try { $avatarWin.ReleaseMouseCapture() | Out-Null } catch {}
    if ($wasDrag) {
      $state.x = [int]$avatarWin.Left; $state.y = [int]$avatarWin.Top; Save-State
      Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ x = $state.x; y = $state.y; size = $state.size } | Out-Null
    } else {
      Toggle-Chat
    }
  })

  # resize grip
  $rsz = @{ on = $false; sx = 0; cur = 0 }
  $grip = $avatarWin.FindName('Grip')
  $grip.Add_MouseLeftButtonDown({
    $rsz.on = $true
    $p = [System.Windows.Input.Mouse]::GetPosition($avatarWin)
    $rsz.sx = $p.X; $rsz.cur = $avatarWin.Width
    $grip.CaptureMouse() | Out-Null
  })
  $grip.Add_MouseMove({
    if ($rsz.on) {
      $p = [System.Windows.Input.Mouse]::GetPosition($avatarWin)
      $nw = [int]($rsz.cur + ($p.X - $rsz.sx))
      if ($nw -lt 48) { $nw = 48 }
      if ($nw -gt 160) { $nw = 160 }
      $avatarWin.Width = $nw; $avatarWin.Height = $nw
    }
  })
  $grip.Add_MouseLeftButtonUp({
    $rsz.on = $false
    try { $grip.ReleaseMouseCapture() | Out-Null } catch {}
    $state.size = [int]$avatarWin.Width; Save-State
    Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ x = [int]$avatarWin.Left; y = [int]$avatarWin.Top; size = $state.size } | Out-Null
    Position-Chat
  })

  # right-click menu
  $avatarWin.Add_MouseRightButtonUp({
    $pinLabel = 'Pin above windows'
    if ($avatarWin.Topmost) { $pinLabel = 'Unpin (allow behind windows)' }
    $menu = New-Object System.Windows.Controls.ContextMenu
    $items = @(
      @{ h = 'Chat'; a = { Toggle-Chat } },
      @{ h = 'Open full page'; a = { Start-Process ($ApiBase + '/bot/' + $BotSlug) } },
      @{ h = $pinLabel; a = { $avatarWin.Topmost = -not $avatarWin.Topmost; $state.top = [bool]$avatarWin.Topmost; Save-State } },
      @{ h = 'Hide companion'; a = { Hide-Companion } },
      @{ h = 'Quit'; a = { [System.Windows.Application]::Current.Shutdown() } }
    )
    foreach ($it in $items) {
      $mi = New-Object System.Windows.Controls.MenuItem
      $mi.Header = $it.h
      $mi.Add_Click($it.a)
      $menu.Items.Add($mi) | Out-Null
    }
    $menu.PlacementTarget = $avatarWin
    $menu.IsOpen = $true
  })
  $avatarWin.Show()
}

function Hide-Companion {
  if ($chatWin) { $chatWin.Hide() }
  $avatarWin.Width = 18; $avatarWin.Height = 18
  $avatarWin.Opacity = 0.55
  Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ hidden = $true } | Out-Null
}
function Restore-Companion {
  $avatarWin.Opacity = 1
  $sz = $state.size
  if (-not $sz) { $sz = $DefaultSize }
  $avatarWin.Width = $sz; $avatarWin.Height = $sz
  Api-Patch ('/api/bots/' + $BotSlug + '/companion') @{ hidden = $false } | Out-Null
}

# ---------- chat window ----------
[xml]$chatXaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
  WindowStyle="None" AllowsTransparency="True" Background="Transparent"
  ShowInTaskbar="False" Width="340" Height="470" Title="__NAME__ chat">
  <Border Background="#0B0B0DF2" BorderBrush="#26262c" BorderThickness="1" CornerRadius="16" Padding="0">
    <Grid>
      <Grid.RowDefinitions>
        <RowDefinition Height="Auto" />
        <RowDefinition Height="*" />
        <RowDefinition Height="Auto" />
        <RowDefinition Height="Auto" />
      </Grid.RowDefinitions>
      <Border Grid.Row="0" Background="#00000000" Padding="12,10" Name="HeadDrag">
        <DockPanel>
          <Ellipse Width="26" Height="26" DockPanel.Dock="Left" Margin="0,0,8,0">
            <Ellipse.Fill><ImageBrush Name="HeadAvatar" Stretch="UniformToFill" /></Ellipse.Fill>
          </Ellipse>
          <StackPanel VerticalAlignment="Center">
            <TextBlock Name="HeadName" Foreground="White" FontWeight="SemiBold" FontSize="13" />
            <TextBlock Name="HeadStatus" Foreground="#71717a" FontSize="11" Text="Idle" />
          </StackPanel>
          <StackPanel DockPanel.Dock="Right" Orientation="Horizontal" HorizontalAlignment="Right">
            <Button Name="BtnPage" Content="&#x2197;" ToolTip="Open full page" Background="Transparent" Foreground="#a1a1aa" BorderThickness="0" FontSize="13" Padding="6,2" Cursor="Hand" />
            <Button Name="BtnHide" Content="&#x2013;" ToolTip="Hide" Background="Transparent" Foreground="#a1a1aa" BorderThickness="0" FontSize="14" Padding="6,2" Cursor="Hand" />
          </StackPanel>
        </DockPanel>
      </Border>
      <ScrollViewer Grid.Row="1" Margin="10,0" Name="Scroller" VerticalScrollBarVisibility="Auto">
        <StackPanel Name="Messages" />
      </ScrollViewer>
      <TextBlock Grid.Row="2" Name="StateLine" Foreground="#71717a" FontSize="11" Margin="12,2" Text="" Visibility="Collapsed" />
      <Grid Grid.Row="3" Margin="10,6,10,10">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="*" />
          <ColumnDefinition Width="Auto" />
          <ColumnDefinition Width="Auto" />
          <ColumnDefinition Width="Auto" />
        </Grid.ColumnDefinitions>
        <TextBox Name="Input" Grid.Column="0" Background="#131316" Foreground="White"
          BorderBrush="#26262c" BorderThickness="1" Padding="8,7" FontSize="13"
          VerticalContentAlignment="Center">
          <TextBox.Resources>
            <Style TargetType="Border"><Setter Property="CornerRadius" Value="10" /></Style>
          </TextBox.Resources>
        </TextBox>
        <Button Name="BtnMic" Grid.Column="1" Content="Mic" ToolTip="Voice input" Margin="6,0,0,0" FontSize="11"
          Background="#131316" Foreground="White" BorderBrush="#26262c" Width="40" Cursor="Hand">
          <Button.Resources><Style TargetType="Border"><Setter Property="CornerRadius" Value="10" /></Style></Button.Resources>
        </Button>
        <Button Name="BtnSpeak" Grid.Column="2" Content="Read" ToolTip="Read aloud" Margin="6,0,0,0" FontSize="11"
          Background="#131316" Foreground="White" BorderBrush="#26262c" Width="40" Cursor="Hand">
          <Button.Resources><Style TargetType="Border"><Setter Property="CornerRadius" Value="10" /></Style></Button.Resources>
        </Button>
        <Button Name="BtnSend" Grid.Column="3" Content="&#x27A4;" Margin="6,0,0,0" Width="38"
          Background="#e5484d" Foreground="White" BorderThickness="0" FontWeight="Bold" Cursor="Hand">
          <Button.Resources><Style TargetType="Border"><Setter Property="CornerRadius" Value="10" /></Style></Button.Resources>
        </Button>
      </Grid>
    </Grid>
  </Border>
</Window>
"@

$chatWin = $null
$msgStack = $null
$scroller = $null
$inputBox = $null
$headStatus = $null
$stateLine = $null
$convId = ''
$historyList = New-Object System.Collections.ArrayList

function Add-Message($role, $text) {
  $chatWin.Dispatcher.Invoke([action]{
    $b = New-Object System.Windows.Controls.Border
    $b.CornerRadius = '12,12,4,12'
    $b.Padding = '10,7'
    $b.Margin = '0,0,0,8'
    $b.MaxWidth = 270
    if ($role -eq 'user') {
      $b.Background = '#26262c'
      $b.HorizontalAlignment = 'Right'
    } else {
      $b.Background = '#131316'
      $b.BorderBrush = '#26262c'
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

function Set-ChatStatus($text, $botState) {
  if ($chatWin) {
    $chatWin.Dispatcher.Invoke([action]{
      $headStatus.Text = $text
      if ($text -eq '') { $stateLine.Visibility = 'Collapsed' }
      else { $stateLine.Visibility = 'Visible'; $stateLine.Text = $text }
    })
  }
  Set-State $botState
}

function Position-Chat {
  if (-not $chatWin -or -not $avatarWin) { return }
  $chatWin.Left = $avatarWin.Left + $avatarWin.Width - 340
  if ($chatWin.Left -lt 8) { $chatWin.Left = 8 }
  $chatWin.Top = $avatarWin.Top - 478
  if ($chatWin.Top -lt 8) { $chatWin.Top = $avatarWin.Top + $avatarWin.Height + 8 }
}

function Toggle-Chat {
  if ($avatarWin.Width -lt 30) { Restore-Companion }
  if ($chatWin -and $chatWin.IsVisible) { $chatWin.Hide(); return }
  Show-Chat
}

function Show-Chat {
  if (-not $chatWin) { Build-Chat }
  Position-Chat
  $chatWin.Topmost = [bool]$state.top
  $chatWin.Show()
  $chatWin.Activate() | Out-Null
  if ($chatWin.Visibility -eq 'Visible') { Set-State 'idle' }
  $inputBox.Focus() | Out-Null
}

function Build-Chat {
  $r = New-Object System.Xml.XmlNodeReader $chatXaml
  $script:chatWin = [Windows.Markup.XamlReader]::Load($r)
  $script:msgStack = $chatWin.FindName('Messages')
  $script:scroller = $chatWin.FindName('Scroller')
  $script:inputBox = $chatWin.FindName('Input')
  $script:headStatus = $chatWin.FindName('HeadStatus')
  $script:stateLine = $chatWin.FindName('StateLine')
  $chatWin.FindName('HeadName').Text = $BotName
  if ((Test-Path $AvatarFile)) {
    try {
      $img = New-Object System.Windows.Media.Imaging.BitmapImage
      $img.BeginInit(); $img.UriSource = $AvatarFile; $img.CacheOption = 'OnLoad'; $img.EndInit()
      $chatWin.FindName('HeadAvatar').ImageSource = $img
    } catch {}
  }
  $dragH = $chatWin.FindName('HeadDrag')
  $dragH.Add_MouseLeftButtonDown({ $chatWin.DragMove() })
  $chatWin.FindName('BtnPage').Add_Click({ Start-Process ($ApiBase + '/bot/' + $BotSlug) })
  $chatWin.FindName('BtnHide').Add_Click({ $chatWin.Hide() })
  $chatWin.FindName('BtnSend').Add_Click({ Send-Chat })
  $chatWin.FindName('BtnMic').Add_Click({ Start-Listen })
  $spk = $chatWin.FindName('BtnSpeak')
  $spk.Opacity = if ($state.tts) { 1.0 } else { 0.45 }
  $spk.Add_Click({
    $state.tts = -not $state.tts; Save-State
    $spk.Opacity = if ($state.tts) { 1.0 } else { 0.45 }
    if (-not $state.tts -and $speaker) { try { $speaker.SpeakAsyncCancelAll() | Out-Null } catch {} }
  })
  $inputBox.Add_KeyDown({
    param($s, $e)
    if ($e.Key -eq 'Enter') { Send-Chat }
  })
  # conversation: reuse stored or create
  if ($state.convId -ne '' -and $state.convId -ne $null) {
    $script:convId = $state.convId
    $h = Api-Get ('/api/bots/' + $BotSlug + '/conversations/' + $convId)
    if ($h -and $h.messages) {
      foreach ($m in $h.messages | Select-Object -Last 20) {
        [void]$historyList.Add(@{ role = [string]$m.role; content = [string]$m.content })
        Add-Message $m.role $m.content
      }
    } else {
      $script:convId = ''
    }
  }
  if ($convId -eq '') {
    $c = Api-Post ('/api/bots/' + $BotSlug + '/conversations') @{}
    if ($c -and $c.id) {
      $script:convId = [string]$c.id
      $state.convId = $script:convId; Save-State
    }
  }
}

function Send-Chat {
  $text = $inputBox.Text.Trim()
  if ($text -eq '' -or $sync.busy) { return }
  $inputBox.Text = ''
  Add-Message 'user' $text
  [void]$historyList.Add(@{ role = 'user'; content = $text })
  $sync.stop = $false
  $sync.busy = $true
  Set-ChatStatus 'Thinking…' 'thinking'
  $msgs = @()
  foreach ($m in ($historyList | Select-Object -Last 20)) {
    $msgs += @{ role = $m.role; content = $m.content }
  }
  $body = @{ conversation_id = $convId; messages = $msgs } | ConvertTo-Json -Depth 6
  $run = {
    param($sync, $chatWin, $msgStack, $scroller, $headStatus, $stateLine, $ApiBase, $BotSlug, $convId, $body, $Headers)
    try {
      $client = New-Object System.Net.Http.HttpClient
      $client.Timeout = [TimeSpan]::FromSeconds(150)
      foreach ($h in $Headers.Keys) { $client.DefaultRequestHeaders.Add($h, $Headers[$h]) | Out-Null }
      $ct = New-Object System.Net.Http.StringContent($body, [Text.Encoding]::UTF8, 'application/json')
      $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, ($ApiBase + '/api/bots/' + $BotSlug + '/chat'))
      $req.Content = $ct
      $resp = $client.SendAsync($req, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
      if (-not $resp.IsSuccessStatusCode) {
        $err = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $chatWin.Dispatcher.Invoke([action]{ $headStatus.Text = 'Error ' + [int]$resp.StatusCode })
        return
      }
      $stream = $resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
      $reader = New-Object System.IO.StreamReader($stream)
      $full = ''
      $bubble = $null
      $tb = $null
      $chatWin.Dispatcher.Invoke([action]{
        $headStatus.Text = 'Responding…'
        $b = New-Object System.Windows.Controls.Border
        $b.CornerRadius = '12,12,12,4'
        $b.Padding = '10,7'
        $b.Margin = '0,0,0,8'
        $b.MaxWidth = 270
        $b.Background = '#131316'
        $b.BorderBrush = '#26262c'
        $b.BorderThickness = '1'
        $b.HorizontalAlignment = 'Left'
        $t = New-Object System.Windows.Controls.TextBlock
        $t.Foreground = 'White'
        $t.FontSize = 13
        $t.TextWrapping = 'Wrap'
        $b.Child = $t
        $msgStack.Children.Add($b) | Out-Null
        $scroller.ScrollToBottom()
        $sync.bubble = $b
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
          $chatWin.Dispatcher.Invoke([action]{ $headStatus.Text = 'Error' })
          $sync.err = [string]$j.error
          break
        }
        if ($j.token) {
          $full += $j.token
          $chatWin.Dispatcher.Invoke([action]{
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
  $ps.AddScript($run).AddArgument($sync).AddArgument($chatWin).AddArgument($msgStack).AddArgument($scroller).AddArgument($headStatus).AddArgument($stateLine).AddArgument($ApiBase).AddArgument($BotSlug).AddArgument($convId).AddArgument($body).AddArgument($Headers) | Out-Null
  $handle = $ps.BeginInvoke()
  $timer = New-Object System.Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromMilliseconds(400)
  $timer.Add_Tick({
    if ($handle.AsyncWaitHandle.WaitOne(0)) {
      $timer.Stop()
      try { $ps.EndInvoke($handle) | Out-Null } catch {}
      $ps.Dispose()
      if ($sync.err -ne $null -and $sync.err -ne '') {
        Add-Message 'user' ('Error: ' + $sync.err)
        $sync.err = ''
        Set-ChatStatus 'Error' 'attention'
      } else {
        [void]$historyList.Add(@{ role = 'assistant'; content = [string]$sync.full })
        if ($chatWin.IsVisible) {
          Set-ChatStatus '' 'idle'
        } else {
          Set-ChatStatus 'New message — click to read' 'attention'
          try { Speak ([string]$sync.full) } catch {}
        }
      }
    }
  })
  $timer.Start()
}

function Start-Listen {
  if (-not $state.stt) {
    Set-ChatStatus 'Enable voice input in Bot settings first' 'attention'
    return
  }
  Set-ChatStatus 'Listening…' 'listening'
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
        Set-ChatStatus 'Voice input unavailable on this PC' 'attention'
      } elseif ($heard -ne '') {
        $inputBox.Text = $heard
        Set-ChatStatus '' 'idle'
        Send-Chat
      } else {
        Set-ChatStatus '' 'idle'
      }
    }
  })
  $timer.Start()
}

# ---------- boot ----------
Show-Avatar
[System.Windows.Application]::new().Run() | Out-Null
'@;`
  return script
    .replace(/__SIZE__/g, String(size))
    .replace(/__NAME__/g, c.name.replace(/"/g, ""))
    .replace(/__ACCENT__/g, accent);
}
