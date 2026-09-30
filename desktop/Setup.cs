using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;

namespace HumanAI
{
    // STEP 1 — login through the website (device code, no passwords in-app).
    class LoginForm : Form
    {
        TextBox _baseBox;
        Label _codeLbl, _statusLbl;
        Button _openBtn, _newBtn;
        System.Windows.Forms.Timer _poll;
        string _code = "";
        public string ApiBase = "https://usehuman.de";

        public LoginForm()
        {
            Text = "Human AI";
            Size = new Size(380, 460);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            BackColor = Color.FromArgb(9, 9, 11);
            ForeColor = Color.White;
            AutoScaleMode = AutoScaleMode.Dpi;

            Label t = new Label();
            t.Text = "Connect desktop app";
            t.Font = new Font("Segoe UI", 16, FontStyle.Bold);
            t.ForeColor = Color.White;
            t.Location = new Point(24, 20);
            t.Size = new Size(320, 32);
            Controls.Add(t);

            Label s = new Label();
            s.Text = "Log in on the website, then enter the code shown here.";
            s.ForeColor = Color.FromArgb(0xA1, 0xA1, 0xAA);
            s.Font = new Font("Segoe UI", 9);
            s.Location = new Point(24, 54);
            s.Size = new Size(320, 36);
            Controls.Add(s);

            Label bl = new Label();
            bl.Text = "Website";
            bl.ForeColor = Color.FromArgb(0x71, 0x71, 0x7A);
            bl.Font = new Font("Segoe UI", 8);
            bl.Location = new Point(24, 100);
            bl.Size = new Size(320, 16);
            Controls.Add(bl);

            _baseBox = new TextBox();
            _baseBox.Text = ApiBase;
            _baseBox.BackColor = Color.FromArgb(0x13, 0x13, 0x16);
            _baseBox.ForeColor = Color.White;
            _baseBox.BorderStyle = BorderStyle.FixedSingle;
            _baseBox.Font = new Font("Segoe UI", 10);
            _baseBox.Location = new Point(24, 118);
            _baseBox.Size = new Size(320, 26);
            Controls.Add(_baseBox);

            _codeLbl = new Label();
            _codeLbl.Text = "····–····";
            _codeLbl.Font = new Font("Consolas", 26, FontStyle.Bold);
            _codeLbl.ForeColor = Color.White;
            _codeLbl.TextAlign = ContentAlignment.MiddleCenter;
            _codeLbl.Location = new Point(24, 160);
            _codeLbl.Size = new Size(320, 52);
            Controls.Add(_codeLbl);

            _openBtn = new Button();
            _openBtn.Text = "Open website login";
            _openBtn.FlatStyle = FlatStyle.Flat;
            _openBtn.FlatAppearance.BorderSize = 0;
            _openBtn.BackColor = Color.FromArgb(0xE5, 0x48, 0x4D);
            _openBtn.ForeColor = Color.White;
            _openBtn.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            _openBtn.Location = new Point(24, 226);
            _openBtn.Size = new Size(320, 40);
            _openBtn.Cursor = Cursors.Hand;
            _openBtn.Enabled = false;
            _openBtn.Click += delegate
            {
                try { Process.Start(ApiBase.TrimEnd('/') + "/desktop/approve?code=" + _code); }
                catch { }
            };
            Controls.Add(_openBtn);

            _newBtn = new Button();
            _newBtn.Text = "Get a new code";
            _newBtn.FlatStyle = FlatStyle.Flat;
            _newBtn.FlatAppearance.BorderSize = 0;
            _newBtn.BackColor = Color.FromArgb(0x1C, 0x1C, 0x22);
            _newBtn.ForeColor = Color.White;
            _newBtn.Font = new Font("Segoe UI", 9);
            _newBtn.Location = new Point(24, 274);
            _newBtn.Size = new Size(320, 34);
            _newBtn.Cursor = Cursors.Hand;
            _newBtn.Click += delegate { FetchCode(); };
            Controls.Add(_newBtn);

            _statusLbl = new Label();
            _statusLbl.Text = "Starting…";
            _statusLbl.ForeColor = Color.FromArgb(0x71, 0x71, 0x7A);
            _statusLbl.Font = new Font("Segoe UI", 9);
            _statusLbl.TextAlign = ContentAlignment.MiddleCenter;
            _statusLbl.Location = new Point(24, 318);
            _statusLbl.Size = new Size(320, 40);
            Controls.Add(_statusLbl);

            _poll = new System.Windows.Forms.Timer();
            _poll.Interval = 2500;
            _poll.Tick += delegate { PollOnce(); };

            Shown += delegate { FetchCode(); };
        }

        void SetStatus(string t)
        {
            if (InvokeRequired) { BeginInvoke(new Action(delegate { SetStatus(t); })); return; }
            _statusLbl.Text = t;
        }

        void FetchCode()
        {
            SetStatus("Requesting code…");
            _openBtn.Enabled = false;
            ApiBase = _baseBox.Text.Trim().TrimEnd('/');
            if (ApiBase == "") ApiBase = "https://usehuman.de";
            Thread t = Threads.Start(delegate
            {
                try
                {
                    Api.Base = ApiBase;
                    Dictionary<string, object> d = Api.Post("/api/desktop/device/start", new Dictionary<string, object>());
                    _code = Json.Str(d, "code");
                    BeginInvoke(new Action(delegate
                    {
                        _codeLbl.Text = _code;
                        _openBtn.Enabled = true;
                        SetStatus("Open the website login and approve this code.");
                        _poll.Start();
                    }));
                }
                catch (Exception ex)
                {
                    BeginInvoke(new Action(delegate
                    {
                        SetStatus("Could not reach server: " + ex.Message);
                    }));
                }
            });

        }

        void PollOnce()
        {
            if (_code == "") return;
            Thread t = Threads.Start(delegate
            {
                try
                {
                    Dictionary<string, object> d = Api.Get("/api/desktop/device/poll?code=" + Uri.EscapeDataString(_code));
                    string st = Json.Str(d, "status");
                    if (st == "approved")
                    {
                        BeginInvoke(new Action(delegate
                        {
                            _poll.Stop();
                            Hide();
                            OnboardForm ob = new OnboardForm(ApiBase, _code);
                            ob.ShowDialog();
                            Close();
                        }));
                    }
                    else if (st == "denied")
                    {
                        BeginInvoke(new Action(delegate
                        {
                            _poll.Stop();
                            SetStatus("Denied on the website. Get a new code to retry.");
                        }));
                    }
                    else if (st == "expired")
                    {
                        BeginInvoke(new Action(delegate
                        {
                            _poll.Stop();
                            SetStatus("Code expired. Get a new code.");
                        }));
                    }
                }
                catch { }
            });

        }
    }

    // STEP 2 — short personal setup: your name, AI name, color, language, voice.
    class OnboardForm : Form
    {
        string _apiBase, _code;
        TextBox _nameBox, _aiBox;
        ComboBox _langBox;
        CheckBox _ttsBox, _sttBox;
        Label _statusLbl;
        Button _finishBtn;
        Panel[] _swatches;
        string _accent = "#e5484d";
        readonly string[] _accents = new string[] {
            "#e5484d", "#f59e0b", "#34d399", "#38bdf8", "#a78bfa", "#f472b6" };

        public OnboardForm(string apiBase, string code)
        {
            _apiBase = apiBase; _code = code;
            Text = "Human AI setup";
            Size = new Size(400, 560);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            BackColor = Color.FromArgb(9, 9, 11);
            ForeColor = Color.White;
            AutoScaleMode = AutoScaleMode.Dpi;

            int y = 20;
            y = AddLabel("What should I call you?", y, 16, true);
            _nameBox = AddBox(y); y += 40;
            y = AddLabel("Choose your AI's name", y, 16, true);
            _aiBox = AddBox(y);
            _aiBox.Text = "Jawad";
            y += 40;
            y = AddLabel("Companion color", y, 11, false);
            Panel sp = new Panel();
            sp.Location = new Point(24, y);
            sp.Size = new Size(340, 36);
            sp.BackColor = BackColor;
            Controls.Add(sp);
            _swatches = new Panel[_accents.Length];
            for (int i = 0; i < _accents.Length; i++)
            {
                Panel p = new Panel();
                p.Size = new Size(30, 30);
                p.Location = new Point(i * 40, 3);
                p.BackColor = ParseAccent(_accents[i]);
                p.Cursor = Cursors.Hand;
                p.BorderStyle = i == 0 ? BorderStyle.Fixed3D : BorderStyle.None;
                string acc = _accents[i];
                int idx = i;
                p.Click += delegate
                {
                    _accent = acc;
                    for (int j = 0; j < _swatches.Length; j++)
                        _swatches[j].BorderStyle = j == idx ? BorderStyle.Fixed3D : BorderStyle.None;
                };
                sp.Controls.Add(p);
                _swatches[i] = p;
            }
            y += 44;
            y = AddLabel("Language", y, 11, false);
            _langBox = new ComboBox();
            _langBox.DropDownStyle = ComboBoxStyle.DropDownList;
            _langBox.BackColor = Color.FromArgb(0x13, 0x13, 0x16);
            _langBox.ForeColor = Color.White;
            _langBox.Font = new Font("Segoe UI", 10);
            _langBox.Items.AddRange(new object[] { "Deutsch", "English", "Türkçe", "العربية", "Français", "Español" });
            _langBox.SelectedIndex = 0;
            _langBox.Location = new Point(24, y);
            _langBox.Size = new Size(340, 26);
            Controls.Add(_langBox);
            y += 36;

            _ttsBox = new CheckBox();
            _ttsBox.Text = "Read answers aloud";
            _ttsBox.Checked = true;
            _ttsBox.ForeColor = Color.White;
            _ttsBox.Location = new Point(24, y);
            _ttsBox.Size = new Size(340, 22);
            Controls.Add(_ttsBox);
            y += 24;
            _sttBox = new CheckBox();
            _sttBox.Text = "Enable microphone input";
            _sttBox.Checked = true;
            _sttBox.ForeColor = Color.White;
            _sttBox.Location = new Point(24, y);
            _sttBox.Size = new Size(340, 22);
            Controls.Add(_sttBox);
            y += 26;
            Label mic = new Label();
            mic.Text = "If the mic stays silent, allow microphone access in Windows Settings → Privacy.";
            mic.ForeColor = Color.FromArgb(0x71, 0x71, 0x7A);
            mic.Font = new Font("Segoe UI", 8);
            mic.Location = new Point(24, y);
            mic.Size = new Size(340, 30);
            Controls.Add(mic);
            y += 34;

            _finishBtn = new Button();
            _finishBtn.Text = "Create my companion";
            _finishBtn.FlatStyle = FlatStyle.Flat;
            _finishBtn.FlatAppearance.BorderSize = 0;
            _finishBtn.BackColor = Color.FromArgb(0xE5, 0x48, 0x4D);
            _finishBtn.ForeColor = Color.White;
            _finishBtn.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            _finishBtn.Location = new Point(24, y);
            _finishBtn.Size = new Size(340, 42);
            _finishBtn.Cursor = Cursors.Hand;
            _finishBtn.Click += delegate { Finish(); };
            Controls.Add(_finishBtn);
            y += 50;

            _statusLbl = new Label();
            _statusLbl.ForeColor = Color.FromArgb(0x71, 0x71, 0x7A);
            _statusLbl.Font = new Font("Segoe UI", 9);
            _statusLbl.TextAlign = ContentAlignment.MiddleCenter;
            _statusLbl.Location = new Point(24, y);
            _statusLbl.Size = new Size(340, 24);
            Controls.Add(_statusLbl);
        }

        static Color ParseAccent(string hex)
        {
            try
            {
                string a = hex.TrimStart('#');
                return Color.FromArgb(Convert.ToInt32(a.Substring(0, 2), 16),
                    Convert.ToInt32(a.Substring(2, 2), 16), Convert.ToInt32(a.Substring(4, 2), 16));
            }
            catch { return Color.Red; }
        }

        int AddLabel(string text, int y, int size, bool bold)
        {
            Label l = new Label();
            l.Text = text;
            l.Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular);
            l.ForeColor = bold ? Color.White : Color.FromArgb(0x71, 0x71, 0x7A);
            l.Location = new Point(24, y);
            l.Size = new Size(340, size + 12);
            Controls.Add(l);
            return y + size + 14;
        }

        TextBox AddBox(int y)
        {
            TextBox b = new TextBox();
            b.BackColor = Color.FromArgb(0x13, 0x13, 0x16);
            b.ForeColor = Color.White;
            b.BorderStyle = BorderStyle.FixedSingle;
            b.Font = new Font("Segoe UI", 11);
            b.Location = new Point(24, y);
            b.Size = new Size(340, 28);
            Controls.Add(b);
            return b;
        }

        void Finish()
        {
            string userName = _nameBox.Text.Trim();
            string aiName = _aiBox.Text.Trim();
            if (userName == "" || aiName == "")
            {
                _statusLbl.Text = "Please enter both names.";
                return;
            }
            _finishBtn.Enabled = false;
            _statusLbl.Text = "Creating your companion…";
            Thread t = Threads.Start(delegate
            {
                try
                {
                    Api.Base = _apiBase;
                    Dictionary<string, object> body = new Dictionary<string, object>();
                    body["code"] = _code;
                    body["userName"] = userName;
                    body["aiName"] = aiName;
                    body["accent"] = _accent;
                    body["language"] = _langBox.SelectedItem.ToString();
                    body["tts"] = _ttsBox.Checked;
                    body["stt"] = _sttBox.Checked;
                    Dictionary<string, object> d = Api.Post("/api/desktop/device/complete", body);
                    Dictionary<string, object> bot = d["bot"] as Dictionary<string, object>;
                    string slug = bot != null ? Json.Str(bot, "slug") : "";
                    string botName = bot != null ? Json.Str(bot, "name") : aiName;
                    string key = Json.Str(d, "apiKey");
                    if (slug == "" || key == "") throw new Exception("incomplete response");
                    DesktopConfig cfg = Store.Load();
                    cfg.ApiBase = _apiBase;
                    cfg.Slug = slug;
                    cfg.BotName = botName;
                    cfg.UserName = userName;
                    cfg.Accent = _accent;
                    cfg.Language = _langBox.SelectedItem.ToString();
                    cfg.Tts = _ttsBox.Checked;
                    cfg.Stt = _sttBox.Checked;
                    cfg.ConvId = "";
                    Store.Save(cfg);
                    Store.SaveKey(key);
                    BeginInvoke(new Action(delegate
                    {
                        Hide();
                        IslandForm island = new IslandForm(Store.Load());
                        island.ShowDialog();
                        Close();
                    }));
                }
                catch (Exception ex)
                {
                    BeginInvoke(new Action(delegate
                    {
                        _statusLbl.Text = ex is ApiError ? ex.Message : "Connection failed.";
                        _finishBtn.Enabled = true;
                    }));
                }
            });

        }
    }
}

