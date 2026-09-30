using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace HumanAI
{
    public enum AvatarState { Idle, Thinking, Generating, Listening, Speaking, Working, Done, Attention, Error }

    // Black mascot avatar, painted with GDI+. Body always stays black;
    // only glow/accents react to state. Subtle premium motion.
    class AvatarView : Control
    {
        AvatarState _state = AvatarState.Idle;
        public AvatarState State
        {
            get { return _state; }
            set { _state = value; Invalidate(); }
        }
        Color _accent = Color.FromArgb(0xE5, 0x48, 0x4D);
        public Color Accent
        {
            get { return _accent; }
            set { _accent = value; Invalidate(); }
        }

        Timer _tick;
        DateTime _t0 = DateTime.UtcNow;
        bool _blink;
        DateTime _blinkAt = DateTime.UtcNow;
        bool _mouth;

        public AvatarView()
        {
            DoubleBuffered = true;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            _tick = new Timer();
            _tick.Interval = 120;
            _tick.Tick += delegate { OnTick(); };
            _tick.Start();
        }

        void OnTick()
        {
            if (!Visible) return;
            DateTime now = DateTime.UtcNow;
            if ((now - _blinkAt).TotalMilliseconds > 3600 &&
                (_state == AvatarState.Idle || _state == AvatarState.Done))
            {
                _blink = true;
                _blinkAt = now;
                Timer once = new Timer();
                once.Interval = 150;
                once.Tick += delegate { _blink = false; once.Stop(); once.Dispose(); Invalidate(); };
                once.Start();
            }
            _mouth = ! _mouth;
            Invalidate();
        }

        Color Glow()
        {
            if (_state == AvatarState.Listening || _state == AvatarState.Done) return Color.FromArgb(0x34, 0xD3, 0x99);
            if (_state == AvatarState.Working) return Color.FromArgb(0xF5, 0x9E, 0x0B);
            if (_state == AvatarState.Error || _state == AvatarState.Attention) return Color.FromArgb(0xE5, 0x48, 0x4D);
            return _accent;
        }

        public static GraphicsPath RoundedRect(Rectangle r, int radius)
        {
            GraphicsPath p = new GraphicsPath();
            int d = radius * 2;
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            int w = Width, h = Height;
            if (w < 8 || h < 8) return;
            double age = (DateTime.UtcNow - _t0).TotalSeconds;

            // glow
            bool active = _state != AvatarState.Idle;
            Color glow = Glow();
            if (active)
            {
                using (GraphicsPath gp = RoundedRect(new Rectangle(2, 2, w - 4, h - 4), w / 4))
                using (PathGradientBrush gb = new PathGradientBrush(gp))
                {
                    gb.CenterColor = Color.FromArgb(70, glow);
                    gb.SurroundColors = new Color[] { Color.FromArgb(0, glow) };
                    g.FillPath(gb, gp);
                }
            }

            // breathing / tilt
            float scale = 1f, angle = 0f;
            if (_state == AvatarState.Idle) scale = 1f + 0.012f * (float)Math.Sin(age * 1.6);
            else if (_state == AvatarState.Thinking || _state == AvatarState.Working || _state == AvatarState.Generating)
                angle = 2.2f * (float)Math.Sin(age * 2.8);
            else if (_state == AvatarState.Done) scale = 1.03f;

            GraphicsContainer ctr = g.BeginContainer();
            g.TranslateTransform(w / 2f, h / 2f);
            g.ScaleTransform(scale, scale);
            g.RotateTransform(angle);
            g.TranslateTransform(-w / 2f, -h / 2f);

            // body
            Rectangle body = new Rectangle(1, 1, w - 2, h - 2);
            using (GraphicsPath bp = RoundedRect(body, w / 4))
            using (SolidBrush bb = new SolidBrush(Color.FromArgb(5, 5, 6)))
            {
                g.FillPath(bb, bp);
                using (Pen pen = new Pen(Color.FromArgb(38, 38, 44), Math.Max(1, w / 64)))
                    g.DrawPath(pen, bp);
            }

            // eyes
            float ex1 = w * 0.28f, ex2 = w * 0.56f, ey = h * 0.35f;
            float ew = w * 0.16f, eh = h * 0.26f;
            if (_state == AvatarState.Listening) eh *= 1.12f;
            if (_blink && (_state == AvatarState.Idle || _state == AvatarState.Done)) eh = Math.Max(2, h * 0.03f);
            using (SolidBrush wb = new SolidBrush(Color.White))
            {
                FillRound(g, wb, ex1, ey, ew, eh);
                FillRound(g, wb, ex2, ey, ew, eh);
            }

            // mouth: smile, or open oval while speaking
            if (_state == AvatarState.Speaking && _mouth)
            {
                using (SolidBrush wb = new SolidBrush(Color.White))
                    g.FillEllipse(wb, w * 0.42f, h * 0.62f, w * 0.16f, h * 0.13f);
            }
            else
            {
                using (Pen pen = new Pen(Color.White, Math.Max(2, w / 32)))
                {
                    pen.StartCap = LineCap.Round; pen.EndCap = LineCap.Round;
                    g.DrawArc(pen, w * 0.35f, h * 0.55f, w * 0.30f, h * 0.22f, 20, 140);
                }
            }

            // listening rings
            if (_state == AvatarState.Listening)
            {
                float ph = (float)((age * 0.7) % 1.0);
                using (Pen pen = new Pen(Color.FromArgb((int)(120 * (1 - ph)), glow), 2))
                {
                    float pad = 4 + ph * w * 0.18f;
                    using (GraphicsPath rp = RoundedRect(
                        new Rectangle((int)pad, (int)pad, (int)(w - pad * 2), (int)(h - pad * 2)), w / 4))
                        g.DrawPath(pen, rp);
                }
            }
            g.EndContainer(ctr);
        }

        static void FillRound(Graphics g, Brush b, float x, float y, float w, float h)
        {
            using (GraphicsPath p = RoundedRect(new Rectangle((int)x, (int)y, (int)Math.Max(1, w), (int)Math.Max(1, h)), (int)Math.Max(1, w / 2)))
                g.FillPath(b, p);
        }
    }
}
