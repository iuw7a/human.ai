using System;
using System.Net;
using System.Windows.Forms;

namespace HumanAI
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            if (args.Length > 0 && args[0] == "--reset")
            {
                Store.Wipe();
            }
            try
            {
                // TLS 1.2 on old defaults (numeric: present since .NET 4.5).
                ServicePointManager.SecurityProtocol =
                    (SecurityProtocolType)(0x30 | 0xC0 | 0x300 | 0xC00);
            }
            catch { }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            DesktopConfig cfg = Store.Load();
            if (cfg.IsComplete())
            {
                Application.Run(new IslandForm(cfg));
            }
            else
            {
                LoginForm login = new LoginForm();
                login.ShowDialog();
            }
        }
    }
}
