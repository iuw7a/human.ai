using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace HumanAI
{
    class Msg
    {
        public string Role;
        public string Content;
        public Msg(string role, string content) { Role = role; Content = content; }
    }

    // One chat row: user bubble (right) or plain AI text (left).
    class MsgRow : Panel
    {
        public new Label Text;
        public bool IsUser;
        public MsgRow(bool isUser, string content)
        {
            IsUser = isUser;
            AutoSize = false;
            BackColor = Color.Transparent;
            Text = new Label();
            Text.Text = content;
            Text.ForeColor = Color.White;
            Text.Font = new Font("Segoe UI", 9.5f);
            Text.AutoSize = false;
            if (isUser)
            {
                Text.BackColor = Color.FromArgb(0x1B, 0x1B, 0x21);
                Text.Padding = new Padding(10, 8, 10, 8);
            }
            else
            {
                Text.BackColor = Color.Transparent;
                Text.Padding = new Padding(2, 4, 2, 4);
            }
            Controls.Add(Text);
        }
        public void Relayout(int listWidth)
        {
            int maxW = (int)(listWidth * (IsUser ? 0.82 : 0.96));
            Size sz = Text.GetPreferredSize(new Size(maxW, 0));
            Text.Size = new Size(Math.Min(maxW, sz.Width + 4), sz.Height + 4);
            if (IsUser) { Text.Left = listWidth - Text.Width - 4; }
            else { Text.Left = 2; }
            Text.Top = 2;
            Size = new Size(listWidth, Text.Height + (IsUser ? 12 : 14));
            if (IsUser)
            {
                using (GraphicsPath p = AvatarView.RoundedRect(
                    new Rectangle(0, 0, Text.Width, Text.Height), 14))
                    Text.Region = new Region(p);
            }
            else Text.Region = null;
        }
    }

    class IslandForm : Form
    {
        [DllImport("user32.dll")]
        static extern int ShowScrollBar(IntPtr hWnd, int wBar, int bShow);

        const int PW = 240, PH = 56, EW = 384, EH = 600;

        DesktopConfig _cfg;
        AvatarState _state = AvatarState.Idle;
        bool _expanded = false;
        bool _busy = false;
        bool _cancelStream;
        string _convId = "";
        List<Msg> _history = new List<Msg>();
        string _lastText = "";
        List<Dictionary<string, object>> _openTasks = new List<Dictionary<string, object>>();

        // controls
        Panel _pill, _full;
        AvatarView _pillAva, _headAva;
        Label _pillName, _pillSub, _chev, _headStatus;
        Panel _dot;
        Panel _msgPanel;
        List<MsgRow> _rows = new List<MsgRow>();
        Label _planLbl;
        TextBox _input;
        Button _btnMic, _btnMenu, _btnSend;
        NotifyIcon _tray;
        ContextMenuStrip _menu;
        System.Windows.Forms.Timer _anim, _doneT, _taskT;
        int _animFromW, _animFromH, _animToW, _animToH;
        DateTime _animT0;
        bool _drag; Point _dragPt; int _dragStartX;
        System.Speech.Synthesis.SpeechSynthesizer _speaker;
        Thread _listenThread;
        System.Speech.Recognition.SpeechRecognitionEngine _rec;
        bool _listening;

        public IslandForm(DesktopConfig cfg)
        {
            _cfg = cfg;
            _convId = cfg.ConvId;
            Api.Base = cfg.ApiBase; Api.Slug = cfg.Slug;
            try { Api.Key = Store.LoadKey(); } catch { Api.Key = ""; }

            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = cfg.Top;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.FromArgb(11, 11, 15);
            AutoScaleMode = AutoScaleMode.Dpi;
            Size = new Size(PW, PH);
            Place();
            BuildPill();
            BuildFull();
            BuildTray();
            _full.Visible = false;

            _anim = new System.Windows.Forms.Timer(); _anim.Interval = 15;
            _anim.Tick += delegate { AnimTick(); };
            _doneT = new System.Windows.Forms.Timer(); _doneT.Interval = 1800;
            _doneT.Tick += delegate { _doneT.Stop(); SetState(AvatarState.Idle, "Idle"); };
            _taskT = new System.Windows.Forms.Timer(); _taskT.Interval = 60000;
            _taskT.Tick += delegate { Thread t = new Thread(RefreshTasks); t.IsBackground = true; t.Start(); };

            try
            {
                _speaker = new System.Speech.Synthesis.SpeechSynthesizer();
                _speaker.SpeakCompleted += delegate
                {
                    BeginInvoke(new Action(delegate
                    {
                        if (_state == AvatarState.Speaking) FlashDone();
                    }));
                };
            }
            catch { _speaker = null; }

            Shown += delegate
            {
                HideScrollbars();
                Thread t = Threads.Start(delegate
                {
                    EnsureConversation();
                    RefreshTasks();
                });

                _taskT.Start();
            };
        }

        // ---------- layout ----------
        void Place()
        {
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            int cx = wa.Width / 2 + _cfg.X;
            Left = cx - Width / 2;
            Top = 8;
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            using (GraphicsPath p = AvatarView.RoundedRect(new Rectangle(0, 0, Width, Height), _expanded ? 24 : 26))
                Region = new Region(p);
        }

        void BuildPill()
        {
            _pill = new Panel();
            _pill.Dock = DockStyle.Fill;
            _pill.BackColor = Color.FromArgb(11, 11, 15);
            _pill.Cursor = Cursors.Hand;
            _pill.MouseDown += PillDown; _pill.MouseMove += PillMove; _pill.MouseUp += PillUp;
            Controls.Add(_pill);

            _pillAva = new AvatarView();
            _pillAva.Size = new Size(40, 40);
            _pillAva.Location = new Point(8, 8);
            _pillAva.Accent = Accent();
            _pill.Controls.Add(_pillAva);

            _pillName = new Label();
            _pillName.Text = _cfg.BotName;
            _pillName.ForeColor = Color.White;
            _pillName.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            _pillName.Location = new Point(54, 6);
            _pillName.Size = new Size(130, 20);
            _pill.Controls.Add(_pillName);

            _pillSub = new Label();
            _pillSub.Text = "Ready to help";
            _pillSub.ForeColor = Color.FromArgb(0x71, 0x71, 0x7A);
            _pillSub.Font = new Font("Segoe UI", 8);
            _pillSub.Location = new Point(54, 27);
            _pillSub.Size = new Size(130, 18);
            _pill.Controls.Add(_pillSub);

            _dot = new Panel();
            _dot.Size = new Size(10, 10);
            _dot.Location = new Point(196, 23);
            _dot.Paint += delegate(object s, PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Color c = DotColor();
                using (SolidBrush b = new SolidBrush(c))
                    e.Graphics.FillEllipse(b, 1, 1, 8, 8);
            };
            _pill.Controls.Add(_dot);

            _chev = new Label();
            _chev.Text = "v";
            _chev.ForeColor = Color.FromArgb(0x71, 0x71, 0x7A);
            _chev.Font = new Font("Segoe UI", 9);
            _chev.Location = new Point(210, 17);
            _chev.Size = new Size(20, 20);
            _pill.Controls.Add(_chev);
        }

        void BuildFull()
        {
            _full = new Panel();
            _full.Dock = DockStyle.Fill;
            _full.BackColor = Color.FromArgb(11, 11, 15);
            _full.Visible = false;
            Controls.Add(_full);

            Panel head = new Panel();
            head.Dock = DockStyle.Top;
            head.Height = 168;
            head.MouseDown += delegate(object s, MouseEventArgs e)
            {
                if (e.Button == MouseButtons.Left) DragMove();
            };
            _full.Controls.Add(head);

            _headAva = new AvatarView();
            _headAva.Size = new Size(88, 84);
            _headAva.Accent = Accent();
            _headAva.Location = new Point((EW - 88) / 2, 12);
            head.Controls.Add(_headAva);

            _headStatus = new Label();
            _headStatus.Text = "Idle";
            _headStatus.ForeColor = Color.FromArgb(0xA1, 0xA1, 0xAA);
            _headStatus.Font = new Font("Segoe UI", 9);
            _headStatus.TextAlign = ContentAlignment.MiddleCenter;
            _headStatus.Location = new Point(0, 102);
            _headStatus.Size = new Size(EW, 20);
            head.Controls.Add(_headStatus);

            Label nm = new Label();
            nm.Text = _cfg.BotName;
            nm.ForeColor = Color.White;
            nm.Font = new Font("Segoe UI", 11, FontStyle.Bold);
            nm.TextAlign = ContentAlignment.MiddleCenter;
            nm.Location = new Point(0, 124);
            nm.Size = new Size(EW, 22);
            head.Controls.Add(nm);

            Panel composer = new Panel();
            composer.Dock = DockStyle.Bottom;
            composer.Height = 122;
            composer.Padding = new Padding(12, 6, 12, 12);
            _full.Controls.Add(composer);

            Panel pillBox = new Panel();
            pillBox.Dock = DockStyle.Fill;
            pillBox.BackColor = Color.FromArgb(5, 5, 6);
            pillBox.Padding = new Padding(12, 8, 12, 8);
            using (GraphicsPath p = AvatarView.RoundedRect(new Rectangle(0, 0, 100, 100), 22))
                pillBox.Region = new Region(p);
            composer.Controls.Add(pillBox);

            _planLbl = new Label();
            _planLbl.Dock = DockStyle.Top;
            _planLbl.Height = 20;
            _planLbl.ForeColor = Color.White;
            _planLbl.Font = new Font("Segoe UI", 8.5f);
            _planLbl.Visible = false;
            _planLbl.Cursor = Cursors.Hand;
            _planLbl.Click += delegate { ShowTaskMenu(); };
            pillBox.Controls.Add(_planLbl);

            Panel row = new Panel();
            row.Dock = DockStyle.Fill;
            pillBox.Controls.Add(row);

            _input = new TextBox();
            _input.BorderStyle = BorderStyle.None;
            _input.BackColor = Color.FromArgb(5, 5, 6);
            _input.ForeColor = Color.White;
            _input.Font = new Font("Segoe UI", 11);
            _input.Multiline = true;
            _input.Location = new Point(2, 8);
            _input.Size = new Size(248, 44);
            _input.Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Top | AnchorStyles.Bottom;
            _input.KeyDown += delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; SendFromInput(); }
            };
            row.Controls.Add(_input);

            _btnMic = MkBtn("Mic", 268);
            _btnMic.Click += delegate { ToggleListen(); };
            row.Controls.Add(_btnMic);
            _btnMenu = MkBtn("···", 306);
            _btnMenu.Click += delegate { ShowMenu(); };
            row.Controls.Add(_btnMenu);
            _btnSend = MkBtn("↑", 344);
            _btnSend.Font = new Font("Segoe UI", 12, FontStyle.Bold);
            _btnSend.Click += delegate
            {
                if (_busy) { _cancelStream = true; return; }
                SendFromInput();
            };
            row.Controls.Add(_btnSend);

            _msgPanel = new Panel();
            _msgPanel.Dock = DockStyle.Fill;
            _msgPanel.AutoScroll = true;
            _msgPanel.BackColor = Color.FromArgb(11, 11, 15);
            _msgPanel.Padding = new Padding(12, 4, 12, 4);
            _msgPanel.Resize += delegate { LayoutRows(); };
            _full.Controls.Add(msgPanelWithHint());
        }

        Panel msgPanelWithHint()
        {
            Panel wrap = new Panel();
            wrap.Dock = DockStyle.Fill;
            _msgPanel.Parent = null;
            wrap.Controls.Add(_msgPanel);
            Label hint = new Label();
            hint.Name = "hint";
            hint.Text = "Ask for anything…";
            hint.ForeColor = Color.FromArgb(0x52, 0x52, 0x5B);
            hint.Font = new Font("Segoe UI", 10);
            hint.TextAlign = ContentAlignment.MiddleCenter;
            hint.Dock = DockStyle.Fill;
            wrap.Controls.Add(hint);
            hint.BringToFront();
            return wrap;
        }

        Button MkBtn(string text, int x)
        {
            Button b = new Button();
            b.Text = text;
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 0;
            b.BackColor = Color.FromArgb(0x1C, 0x1C, 0x22);
            b.ForeColor = Color.White;
            b.Font = new Font("Segoe UI", 8.5f);
            b.Location = new Point(x, 10);
            b.Size = new Size(32, 32);
            b.Cursor = Cursors.Hand;
            using (GraphicsPath p = AvatarView.RoundedRect(new Rectangle(0, 0, 32, 32), 16))
                b.Region = new Region(p);
            return b;
        }

        void HideScrollbars()
        {
            try
            {
                if (_msgPanel.IsHandleCreated) ShowScrollBar(_msgPanel.Handle, 1, 0);
                else _msgPanel.HandleCreated += delegate { ShowScrollBar(_msgPanel.Handle, 1, 0); };
            }
            catch { }
        }

        // ---------- state ----------
        Color Accent()
        {
            try
            {
                string a = _cfg.Accent.TrimStart('#');
                return Color.FromArgb(Convert.ToInt32(a.Substring(0, 2), 16),
                    Convert.ToInt32(a.Substring(2, 2), 16), Convert.ToInt32(a.Substring(4, 2), 16));
            }
            catch { return Color.FromArgb(0xE5, 0x48, 0x4D); }
        }

        Color DotColor()
        {
            if (_state == AvatarState.Listening || _state == AvatarState.Done) return Color.FromArgb(0x34, 0xD3, 0x99);
            if (_state == AvatarState.Working) return Color.FromArgb(0xF5, 0x9E, 0x0B);
            if (_state == AvatarState.Error || _state == AvatarState.Attention) return Color.FromArgb(0xE5, 0x48, 0x4D);
            if (_state == AvatarState.Idle) return Color.FromArgb(0x10, 0xB9, 0x81);
            return Accent();
        }

        string StateText(AvatarState s)
        {
            if (s == AvatarState.Thinking) return "Thinking…";
            if (s == AvatarState.Generating) return "Generating…";
            if (s == AvatarState.Listening) return "Listening…";
            if (s == AvatarState.Speaking) return "Speaking…";
            if (s == AvatarState.Working) return "Working…";
            if (s == AvatarState.Done) return "Done";
            if (s == AvatarState.Error) return "Error";
            return "Idle";
        }

        void SetState(AvatarState s, string text)
        {
            if (InvokeRequired) { BeginInvoke(new Action(delegate { SetState(s, text); })); return; }
            _state = s;
            _pillAva.State = s; _headAva.State = s;
            string t = text ?? StateText(s);
            _pillSub.Text = t; _headStatus.Text = t;
            _dot.Invalidate();
        }

        void FlashDone()
        {
            SetState(AvatarState.Done, null);
            _doneT.Stop(); _doneT.Start();
        }

        // ---------- expand / collapse ----------
        void AnimTo(int w, int h)
        {
            _animFromW = Width; _animFromH = Height;
            _animToW = w; _animToH = h;
            _animT0 = DateTime.UtcNow;
            _anim.Start();
        }

        void AnimTick()
        {
            double t = (DateTime.UtcNow - _animT0).TotalMilliseconds / 170.0;
            if (t >= 1) t = 1;
            double e = 1 - Math.Pow(1 - t, 3);
            int w = _animFromW + (int)((_animToW - _animFromW) * e);
            int h = _animFromH + (int)((_animToH - _animFromH) * e);
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            int cx = wa.Width / 2 + _cfg.X;
            SetBounds(cx - w / 2, 8, w, h);
            if (t >= 1) _anim.Stop();
        }

        void Toggle()
        {
            if (_busy && !_expanded) return;
            if (_expanded) Collapse(); else Expand();
        }

        void Expand()
        {
            if (_expanded) return;
            _expanded = true;
            _chev.Text = "^";
            _pill.Visible = false;
            _full.Visible = true;
            AnimTo(EW, EH);
            BeginInvoke(new Action(delegate { _input.Focus(); }));
        }

        void Collapse()
        {
            if (!_expanded) return;
            _expanded = false;
            _chev.Text = "v";
            _full.Visible = false;
            _pill.Visible = true;
            AnimTo(PW, PH);
            SetState(AvatarState.Idle, null);
        }

        // ---------- drag (pill + header) ----------
        void PillDown(object s, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            _drag = true; _dragPt = e.Location; _dragStartX = Left;
            foreach (Control c in _pill.Controls) c.MouseDown += PillDown;
        }
        void PillMove(object s, MouseEventArgs e)
        {
            if (!_drag || _expanded) return;
            int dx = e.X - _dragPt.X;
            if (Math.Abs(dx) < 4) return;
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            int nl = Math.Max(8, Math.Min(wa.Width - Width - 8, _dragStartX + dx));
            Left = nl;
        }
        void PillUp(object s, MouseEventArgs e)
        {
            if (!_drag) return;
            _drag = false;
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            int cx = Left + Width / 2;
            if (Math.Abs(cx - (_dragStartX + Width / 2)) < 4) Toggle();
            else
            {
                _cfg.X = cx - wa.Width / 2;
                Store.Save(_cfg);
            }
        }
        void DragMove()
        {
            // header drag on expanded view
            NativeMethods.ReleaseCapture();
            NativeMethods.SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero);
        }

        // ---------- messages ----------
        void LayoutRows()
        {
            int y = 4;
            int w = Math.Max(50, _msgPanel.ClientSize.Width - 24);
            foreach (MsgRow r in _rows)
            {
                r.Location = new Point(12, y);
                r.Relayout(w);
                y += r.Height;
            }
            Control hint = _full.Controls.Find("hint", true).Length > 0 ? _full.Controls.Find("hint", true)[0] : null;
            if (hint != null) hint.Visible = _rows.Count == 0;
        }

        MsgRow AddRow(bool isUser, string content, bool animate)
        {
            MsgRow r = new MsgRow(isUser, content);
            _rows.Add(r);
            _msgPanel.Controls.Add(r);
            LayoutRows();
            _msgPanel.ScrollControlIntoView(r);
            HideScrollbars();
            return r;
        }

        void ClearRows()
        {
            _msgPanel.Controls.Clear();
            _rows.Clear();
            LayoutRows();
        }

        void SendFromInput()
        {
            string text = _input.Text.Trim();
            if (text == "" || _busy) return;
            _input.Text = "";
            if (!_expanded) Expand();
            Send(text);
        }

        void Send(string text)
        {
            _lastText = text;
            _busy = true; _cancelStream = false;
            _btnSend.Text = "■";
            Msg m = new Msg("user", text);
            _history.Add(m);
            AddRow(true, text, true);
            SetState(AvatarState.Thinking, null);
            List<Msg> snap = new List<Msg>(_history);
            Thread t = Threads.Start(delegate { SendBg(snap); });

            // persist user message (best effort)
            Thread p = Threads.Start(delegate
            {
                try
                {
                    Dictionary<string, object> b = new Dictionary<string, object>();
                    b["conversation_id"] = _convId; b["content"] = text;
                    Api.Post("/api/bots/" + _cfg.Slug + "/messages", b);
                }
                catch { }
            });

        }

        void SendBg(List<Msg> snap)
        {
            List<Dictionary<string, string>> api = new List<Dictionary<string, string>>();
            foreach (Msg m in snap)
            {
                if (api.Count >= 20) api.RemoveAt(0);
                Dictionary<string, string> d = new Dictionary<string, string>();
                d["role"] = m.Role; d["content"] = m.Content;
                api.Add(d);
            }
            MsgRow aiRow = null;
            StringBuilder full = new StringBuilder();
            DateTime lastUi = DateTime.UtcNow;
            bool firstToken = true;
            try
            {
                Invoke(new Action(delegate { aiRow = AddRow(false, "", false); }));
                Api.ChatStream(_convId, api, delegate(string tok)
                {
                    full.Append(tok);
                    if (firstToken)
                    {
                        firstToken = false;
                        BeginInvoke(new Action(delegate { SetState(AvatarState.Generating, null); }));
                    }
                    if ((DateTime.UtcNow - lastUi).TotalMilliseconds > 80)
                    {
                        lastUi = DateTime.UtcNow;
                        string snapshot = full.ToString();
                        BeginInvoke(new Action(delegate
                        {
                            if (aiRow != null && !aiRow.IsDisposed)
                            {
                                aiRow.Text.Text = snapshot;
                                LayoutRows();
                                _msgPanel.ScrollControlIntoView(aiRow);
                            }
                        }));
                    }
                }, delegate { return _cancelStream; });
                string done = full.ToString();
                BeginInvoke(new Action(delegate { FinishSend(aiRow, done, null); }));
            }
            catch (Exception ex)
            {
                string msg = ex is ApiError ? ex.Message : "Connection failed.";
                BeginInvoke(new Action(delegate { FinishSend(aiRow, "", msg); }));
            }
        }

        void FinishSend(MsgRow aiRow, string text, string error)
        {
            _busy = false;
            _btnSend.Text = "↑";
            if (error != null)
            {
                if (aiRow != null) { _msgPanel.Controls.Remove(aiRow); _rows.Remove(aiRow); }
                MsgRow er = AddRow(false, "Error: " + error, true);
                er.Text.ForeColor = Color.FromArgb(0xF5, 0x5A, 0x5E);
                SetState(AvatarState.Error, "Error — tap Send to retry");
                LayoutRows();
                return;
            }
            if (aiRow != null)
            {
                aiRow.Text.Text = text;
                LayoutRows();
            }
            _history.Add(new Msg("assistant", text));
            if (_cfg.Tts && _speaker != null && text.Trim() != "")
            {
                SetState(AvatarState.Speaking, null);
                try { _speaker.SpeakAsyncCancelAll(); _speaker.SpeakAsync(text); }
                catch { FlashDone(); }
            }
            else FlashDone();
        }

        // ---------- conversations ----------
        void EnsureConversation()
        {
            try
            {
                if (_convId != "")
                {
                    Dictionary<string, object> h = Api.Get("/api/bots/" + _cfg.Slug + "/conversations/" + _convId);
                    if (h != null)
                    {
                        LoadHistory(h);
                        return;
                    }
                    _convId = "";
                }
                Dictionary<string, object> c = Api.Post("/api/bots/" + _cfg.Slug + "/conversations", new Dictionary<string, object>());
                if (c != null)
                {
                    _convId = Json.Str(c, "id");
                    _cfg.ConvId = _convId;
                    Store.Save(_cfg);
                }
            }
            catch { }
        }

        void LoadHistory(Dictionary<string, object> h)
        {
            System.Collections.ArrayList msgs = Json.List(h, "messages");
            List<Msg> loaded = new List<Msg>();
            int n = msgs.Count;
            for (int i = Math.Max(0, n - 20); i < n; i++)
            {
                Dictionary<string, object> m = msgs[i] as Dictionary<string, object>;
                if (m == null) continue;
                loaded.Add(new Msg(Json.Str(m, "role"), Json.Str(m, "content")));
            }
            BeginInvoke(new Action(delegate
            {
                _history = loaded;
                ClearRows();
                foreach (Msg m in loaded) AddRow(m.Role == "user", m.Content, false);
            }));
        }

        void NewChat()
        {
            if (_busy) return;
            SetState(AvatarState.Working, "Starting chat…");
            Thread t = Threads.Start(delegate
            {
                try
                {
                    Dictionary<string, object> c = Api.Post("/api/bots/" + _cfg.Slug + "/conversations", new Dictionary<string, object>());
                    string id = Json.Str(c, "id");
                    if (id == "") throw new Exception("empty");
                    _convId = id; _cfg.ConvId = id; Store.Save(_cfg);
                    BeginInvoke(new Action(delegate
                    {
                        _history.Clear();
                        ClearRows();
                        _input.Text = "";
                        FlashDone();
                    }));
                }
                catch
                {
                    BeginInvoke(new Action(delegate { SetState(AvatarState.Error, "Could not start chat"); }));
                }
            });

        }

        void OpenChat(string id)
        {
            if (_busy || id == "" || id == _convId) return;
            if (!_expanded) Expand();
            SetState(AvatarState.Working, "Opening chat…");
            Thread t = Threads.Start(delegate
            {
                try
                {
                    Dictionary<string, object> h = Api.Get("/api/bots/" + _cfg.Slug + "/conversations/" + id);
                    if (h == null) throw new Exception("missing");
                    _convId = id; _cfg.ConvId = id; Store.Save(_cfg);
                    LoadHistory(h);
                    BeginInvoke(new Action(delegate { FlashDone(); }));
                }
                catch
                {
                    BeginInvoke(new Action(delegate { SetState(AvatarState.Error, "Could not open chat"); }));
                }
            });

        }

        // ---------- tasks (real plan line) ----------
        void RefreshTasks()
        {
            try
            {
                Dictionary<string, object> t = Api.Get("/api/bots/" + _cfg.Slug + "/tasks");
                if (t == null) return;
                System.Collections.ArrayList all = Json.List(t, "tasks");
                List<Dictionary<string, object>> open = new List<Dictionary<string, object>>();
                foreach (object o in all)
                {
                    Dictionary<string, object> d = o as Dictionary<string, object>;
                    if (d == null) continue;
                    object done;
                    if (d.TryGetValue("done", out done) && Convert.ToBoolean(done)) continue;
                    open.Add(d);
                }
                _openTasks = open;
                BeginInvoke(new Action(delegate
                {
                    if (open.Count == 0) { _planLbl.Visible = false; return; }
                    string title = Json.Str(open[0], "title");
                    if (title.Length > 40) title = title.Substring(0, 40);
                    string txt = title;
                    if (open.Count > 1) txt += " (+" + (open.Count - 1) + " more)";
                    _planLbl.Text = "Plan  " + txt;
                    _planLbl.Visible = true;
                }));
                // due reminders
                DateTime now = DateTime.Now;
                foreach (Dictionary<string, object> d in open)
                {
                    string dueS = Json.Str(d, "due_at");
                    if (dueS == "") continue;
                    DateTime due;
                    if (!DateTime.TryParse(dueS, out due)) continue;
                    if (due > now) continue;
                    object not;
                    if (d.TryGetValue("notified", out not) && Convert.ToBoolean(not)) continue;
                    try
                    {
                        Dictionary<string, object> b = new Dictionary<string, object>();
                        b["id"] = Json.Str(d, "id"); b["notified"] = true;
                        Api.Post("/api/bots/" + _cfg.Slug + "/tasks", b);
                    }
                    catch { }
                    string rt = Json.Str(d, "title");
                    BeginInvoke(new Action(delegate
                    {
                        SetState(AvatarState.Attention, "Reminder");
                        _tray.ShowBalloonTip(5000, _cfg.BotName, rt, ToolTipIcon.Info);
                        Speak("Reminder: " + rt);
                    }));
                }
            }
            catch { }
        }

        void ShowTaskMenu()
        {
            ContextMenuStrip m = new ContextMenuStrip();
            foreach (Dictionary<string, object> d in _openTasks)
            {
                string title = Json.Str(d, "title");
                if (title.Length > 42) title = title.Substring(0, 42) + "…";
                ToolStripMenuItem it = new ToolStripMenuItem(title);
                string id = Json.Str(d, "id");
                it.Click += delegate
                {
                    Thread t = Threads.Start(delegate
                    {
                        try
                        {
                            Dictionary<string, object> b = new Dictionary<string, object>();
                            b["id"] = id; b["done"] = true;
                            PatchReq("/api/bots/" + _cfg.Slug + "/tasks", b);
                        }
                        catch { }
                        RefreshTasks();
                    });

                };
                m.Items.Add(it);
            }
            if (_openTasks.Count == 0)
                m.Items.Add(new ToolStripMenuItem("(no open tasks)") { Enabled = false });
            m.Show(_planLbl, new Point(0, _planLbl.Height));
        }

        static void PatchReq(string path, object body)
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(Api.Base.TrimEnd('/') + path);
            req.Method = "PATCH";
            req.Timeout = 30000;
            req.ContentType = "application/json";
            req.UserAgent = "HumanAI-Desktop/1.0";
            if (Api.Key != "") req.Headers["x-api-key"] = Api.Key;
            byte[] buf = System.Text.Encoding.UTF8.GetBytes(Json.Encode(body));
            req.ContentLength = buf.Length;
            using (System.IO.Stream s = req.GetRequestStream()) s.Write(buf, 0, buf.Length);
            using (HttpWebResponse res = (HttpWebResponse)req.GetResponse()) { }
        }

        void Speak(string text)
        {
            if (!_cfg.Tts || _speaker == null || text.Trim() == "") return;
            SetState(AvatarState.Speaking, null);
            try { _speaker.SpeakAsyncCancelAll(); _speaker.SpeakAsync(text); }
            catch { FlashDone(); }
        }

        // ---------- mic ----------
        void ToggleListen()
        {
            if (_listening)
            {
                try { if (_rec != null) _rec.RecognizeAsyncCancel(); } catch { }
                return;
            }
            if (!_cfg.Stt)
            {
                SetState(AvatarState.Attention, "Enable mic in Menu → Mic");
                return;
            }
            if (!_expanded) Expand();
            SetState(AvatarState.Listening, null);
            _listenThread = new Thread(ListenBg);
            _listenThread.IsBackground = true;
            _listenThread.Start();
        }

        void ListenBg()
        {
            try
            {
                _listening = true;
                _rec = new System.Speech.Recognition.SpeechRecognitionEngine();
                _rec.SetInputToDefaultAudioDevice();
                _rec.LoadGrammar(new System.Speech.Recognition.DictationGrammar());
                System.Speech.Recognition.RecognitionResult res =
                    _rec.Recognize(new TimeSpan(0, 0, 12));
                string heard = (res != null && res.Text != null) ? res.Text.Trim() : "";
                try { _rec.Dispose(); } catch { }
                _rec = null;
                _listening = false;
                BeginInvoke(new Action(delegate
                {
                    if (heard != "")
                    {
                        _input.Text = heard;
                        SendFromInput();
                    }
                    else SetState(AvatarState.Idle, null);
                }));
            }
            catch
            {
                _listening = false;
                BeginInvoke(new Action(delegate
                {
                    SetState(AvatarState.Attention, "Mic unavailable — check Windows mic permission");
                }));
            }
        }

        // ---------- menu / tray ----------
        void ShowMenu()
        {
            if (_menu != null) { try { _menu.Dispose(); } catch { } }
            _menu = new ContextMenuStrip();
            _menu.Items.Add("New chat", null, delegate { NewChat(); });
            ToolStripMenuItem recent = new ToolStripMenuItem("Recent chats");
            recent.DropDownOpening += delegate
            {
                recent.DropDownItems.Clear();
                Thread t = Threads.Start(delegate
                {
                    List<string[]> items = new List<string[]>();
                    try
                    {
                        Dictionary<string, object> l = Api.Get("/api/bots/" + _cfg.Slug + "/conversations");
                        if (l != null)
                        {
                            System.Collections.ArrayList cs = Json.List(l, "conversations");
                            int n = 0;
                            foreach (object o in cs)
                            {
                                if (n++ >= 8) break;
                                Dictionary<string, object> c = o as Dictionary<string, object>;
                                if (c == null) continue;
                                string title = Json.Str(c, "title");
                                if (title == "" || title == "New conversation")
                                {
                                    string upd = Json.Str(c, "updated_at");
                                    DateTime dt;
                                    title = DateTime.TryParse(upd, out dt) ? dt.ToString("g") : Json.Str(c, "id");
                                }
                                if (title.Length > 32) title = title.Substring(0, 32) + "…";
                                string id = Json.Str(c, "id");
                                if (id == _convId) title = "● " + title;
                                items.Add(new string[] { title, id });
                            }
                        }
                    }
                    catch { }
                    BeginInvoke(new Action(delegate
                    {
                        recent.DropDownItems.Clear();
                        if (items.Count == 0)
                            recent.DropDownItems.Add(new ToolStripMenuItem("(no chats yet)") { Enabled = false });
                        foreach (string[] it in items)
                        {
                            string cap = it[0], cid = it[1];
                            recent.DropDownItems.Add(cap, null, delegate { OpenChat(cid); });
                        }
                    }));
                });

            };
            _menu.Items.Add(recent);
            _menu.Items.Add(new ToolStripSeparator());
            ToolStripMenuItem pin = new ToolStripMenuItem(TopMost ? "Unpin" : "Pin above windows");
            pin.Click += delegate
            {
                TopMost = !TopMost;
                _cfg.Top = TopMost;
                Store.Save(_cfg);
            };
            _menu.Items.Add(pin);
            _menu.Items.Add("Open website", null, delegate
            {
                try { Process.Start(_cfg.ApiBase.TrimEnd('/') + "/bot/" + _cfg.Slug); }
                catch { }
            });
            ToolStripMenuItem mic = new ToolStripMenuItem(_cfg.Stt ? "Mic: on" : "Mic: off");
            mic.Click += delegate
            {
                _cfg.Stt = !_cfg.Stt;
                Store.Save(_cfg);
            };
            _menu.Items.Add(mic);
            ToolStripMenuItem tts = new ToolStripMenuItem(_cfg.Tts ? "Read aloud: on" : "Read aloud: off");
            tts.Click += delegate
            {
                _cfg.Tts = !_cfg.Tts;
                Store.Save(_cfg);
                if (!_cfg.Tts && _speaker != null)
                    try { _speaker.SpeakAsyncCancelAll(); }
                    catch { }
            };
            _menu.Items.Add(tts);
            ToolStripMenuItem auto = new ToolStripMenuItem(_cfg.Autostart ? "Start with Windows: on" : "Start with Windows: off");
            auto.Click += delegate
            {
                _cfg.Autostart = !_cfg.Autostart;
                Store.Save(_cfg);
                SetAutostart(_cfg.Autostart);
            };
            _menu.Items.Add(auto);
            _menu.Items.Add(new ToolStripSeparator());
            _menu.Items.Add("Collapse", null, delegate { Collapse(); });
            _menu.Items.Add("Hide", null, delegate { Hide(); });
            _menu.Items.Add("Quit", null, delegate { Application.Exit(); });
            _menu.Show(this, new Point(Width - 190, _expanded ? 170 : Height));
        }

        static void SetAutostart(bool on)
        {
            try
            {
                RegistryKey rk = Registry.CurrentUser.OpenSubKey(
                    "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", true);
                if (rk == null) return;
                if (on) rk.SetValue("HumanAI", "\"" + Application.ExecutablePath + "\"");
                else rk.DeleteValue("HumanAI", false);
                rk.Close();
            }
            catch { }
        }

        void BuildTray()
        {
            _tray = new NotifyIcon();
            _tray.Text = "Human AI";
            _tray.Icon = SystemIcons.Application;
            _tray.Visible = true;
            _tray.DoubleClick += delegate
            {
                if (!Visible) Show();
                if (_expanded) Collapse(); else Expand();
            };
            ContextMenuStrip tm = new ContextMenuStrip();
            tm.Items.Add("Open", null, delegate { Show(); Expand(); });
            tm.Items.Add("Quit", null, delegate { Application.Exit(); });
            _tray.ContextMenuStrip = tm;
            SetAutostart(_cfg.Autostart);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            try
            {
                if (_tray != null) _tray.Visible = false;
                if (_rec != null) try { _rec.Dispose(); } catch { }
                if (_speaker != null) try { _speaker.Dispose(); } catch { }
            }
            catch { }
            base.OnFormClosing(e);
        }
    }

    static class NativeMethods
    {
        [DllImport("user32.dll")]
        public static extern bool ReleaseCapture();
        [DllImport("user32.dll")]
        public static extern int SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
    }
}

