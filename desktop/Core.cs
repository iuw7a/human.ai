using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace HumanAI
{
    static class Threads
    {
        public static Thread Start(ThreadStart fn)
        {
            Thread t = new Thread(fn);
            t.IsBackground = true;
            t.Start();
            return t;
        }
    }

    // ---------- JSON ----------
    static class Json
    {
        static JavaScriptSerializer Ser()
        {
            JavaScriptSerializer s = new JavaScriptSerializer();
            s.MaxJsonLength = int.MaxValue;
            return s;
        }
        public static string Encode(object o) { return Ser().Serialize(o); }
        public static Dictionary<string, object> DecodeDict(string json)
        {
            object o = Ser().DeserializeObject(json);
            return o as Dictionary<string, object>;
        }
        public static string Str(Dictionary<string, object> d, string key)
        {
            if (d == null || !d.ContainsKey(key) || d[key] == null) return "";
            return d[key].ToString();
        }
        public static System.Collections.ArrayList List(Dictionary<string, object> d, string key)
        {
            if (d == null || !d.ContainsKey(key)) return new System.Collections.ArrayList();
            return d[key] as System.Collections.ArrayList;
        }
    }

    // ---------- API errors carry the server's friendly message ----------
    class ApiError : Exception
    {
        public int Status;
        public ApiError(int status, string message) : base(message) { Status = status; }
    }

    // ---------- Config (plain) + secret key (DPAPI) ----------
    class DesktopConfig
    {
        public string ApiBase = "https://usehuman.de";
        public string Slug = "";
        public string BotName = "Jawad";
        public string UserName = "";
        public string Accent = "#e5484d";
        public string Language = "Deutsch";
        public bool Tts = true;
        public bool Stt = true;
        public bool Top = true;
        public bool Autostart = false;
        public int X = 0; // offset from screen-center X
        public string ConvId = "";
        public bool IsComplete() { return Slug != "" && File.Exists(Store.KeyPath); }
    }

    static class Store
    {
        public static readonly string Dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "HumanAI", "desktop");
        public static readonly string CfgPath = Path.Combine(Dir, "config.json");
        public static readonly string KeyPath = Path.Combine(Dir, "key.dat");

        public static DesktopConfig Load()
        {
            DesktopConfig c = new DesktopConfig();
            try
            {
                if (File.Exists(CfgPath))
                {
                    Dictionary<string, object> d = Json.DecodeDict(File.ReadAllText(CfgPath, Encoding.UTF8));
                    if (d == null) return c;
                    c.ApiBase = Pick(d, "apiBase", c.ApiBase);
                    c.Slug = Pick(d, "slug", "");
                    c.BotName = Pick(d, "botName", "Jawad");
                    c.UserName = Pick(d, "userName", "");
                    c.Accent = Pick(d, "accent", "#e5484d");
                    c.Language = Pick(d, "language", "Deutsch");
                    c.Tts = PickB(d, "tts", true);
                    c.Stt = PickB(d, "stt", true);
                    c.Top = PickB(d, "top", true);
                    c.Autostart = PickB(d, "autostart", false);
                    c.X = PickI(d, "x", 0);
                    c.ConvId = Pick(d, "convId", "");
                }
            }
            catch { }
            return c;
        }

        static string Pick(Dictionary<string, object> d, string k, string fb)
        {
            if (!d.ContainsKey(k) || d[k] == null) return fb;
            return d[k].ToString();
        }
        static bool PickB(Dictionary<string, object> d, string k, bool fb)
        {
            if (!d.ContainsKey(k) || d[k] == null) return fb;
            try { return Convert.ToBoolean(d[k]); } catch { return fb; }
        }
        static int PickI(Dictionary<string, object> d, string k, int fb)
        {
            if (!d.ContainsKey(k) || d[k] == null) return fb;
            try { return Convert.ToInt32(d[k]); } catch { return fb; }
        }

        public static void Save(DesktopConfig c)
        {
            Directory.CreateDirectory(Dir);
            Dictionary<string, object> d = new Dictionary<string, object>();
            d["apiBase"] = c.ApiBase; d["slug"] = c.Slug; d["botName"] = c.BotName;
            d["userName"] = c.UserName; d["accent"] = c.Accent; d["language"] = c.Language;
            d["tts"] = c.Tts; d["stt"] = c.Stt; d["top"] = c.Top;
            d["autostart"] = c.Autostart; d["x"] = c.X; d["convId"] = c.ConvId;
            File.WriteAllText(CfgPath, Json.Encode(d), Encoding.UTF8);
        }

        public static void SaveKey(string raw)
        {
            Directory.CreateDirectory(Dir);
            byte[] enc = ProtectedData.Protect(Encoding.UTF8.GetBytes(raw), null, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(KeyPath, enc);
        }

        public static string LoadKey()
        {
            byte[] enc = File.ReadAllBytes(KeyPath);
            byte[] raw = ProtectedData.Unprotect(enc, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(raw);
        }

        public static void Wipe()
        {
            try { Directory.Delete(Dir, true); } catch { }
        }
    }

    // ---------- HTTP API client (sync; call from background threads) ----------
    static class Api
    {
        public static string Base = "https://usehuman.de";
        public static string Slug = "";
        public static string Key = "";

        public delegate void TokenHandler(string token);

        static HttpWebRequest Make(string method, string url, string body, int timeout)
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = method;
            req.Timeout = timeout;
            req.ReadWriteTimeout = timeout;
            req.UserAgent = "HumanAI-Desktop/1.0";
            req.Accept = "application/json";
            req.AllowAutoRedirect = false;
            if (Key != "") req.Headers["x-api-key"] = Key;
            if (body != null)
            {
                byte[] buf = Encoding.UTF8.GetBytes(body);
                req.ContentType = "application/json";
                req.ContentLength = buf.Length;
                using (Stream s = req.GetRequestStream()) s.Write(buf, 0, buf.Length);
            }
            return req;
        }

        static string CombineUrl(string url, string loc)
        {
            if (loc.StartsWith("http://") || loc.StartsWith("https://")) return loc;
            try
            {
                Uri baseUri = new Uri(url);
                return new Uri(baseUri, loc).ToString();
            }
            catch { return loc; }
        }

        static bool IsRedirect(int status)
        {
            return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
        }

        // One manual redirect hop (servers often redirect apex -> www).
        static HttpWebResponse GetResp(string method, string path, string body, int timeout)
        {
            string url = Base.TrimEnd('/') + path;
            for (int hop = 0; hop < 2; hop++)
            {
                HttpWebRequest req = Make(method, url, body, timeout);
                try { return (HttpWebResponse)req.GetResponse(); }
                catch (WebException ex)
                {
                    HttpWebResponse r = ex.Response as HttpWebResponse;
                    if (r != null && IsRedirect((int)r.StatusCode))
                    {
                        string loc = r.Headers["Location"];
                        r.Close();
                        if (loc != null && loc != "")
                        {
                            url = CombineUrl(url, loc);
                            continue;
                        }
                    }
                    throw;
                }
            }
            throw new WebException("Too many redirects.");
        }

        static string ReadError(WebException ex)
        {
            try
            {
                HttpWebResponse r = ex.Response as HttpWebResponse;
                int status = r != null ? (int)r.StatusCode : 0;
                string body = "";
                if (ex.Response != null)
                    using (StreamReader sr = new StreamReader(ex.Response.GetResponseStream(), Encoding.UTF8))
                        body = sr.ReadToEnd();
                string msg = "Request failed (" + status + ").";
                try
                {
                    string trimmed = body.Trim();
                    if (trimmed.StartsWith("<"))
                    {
                        msg = "Server does not support desktop login (website update required).";
                    }
                    else
                    {
                        Dictionary<string, object> d = Json.DecodeDict(body);
                        string e = Json.Str(d, "error");
                        if (e != "") msg = e;
                        else if (trimmed != "") msg = trimmed.Substring(0, Math.Min(200, trimmed.Length));
                    }
                }
                catch { }
                throw new ApiError(status, msg);
            }
            catch (ApiError) { throw; }
            catch (Exception e2) { throw new ApiError(0, e2.Message); }
        }

        public static Dictionary<string, object> Get(string path)
        {
            try
            {
                using (HttpWebResponse res = GetResp("GET", path, null, 30000))
                using (StreamReader sr = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                    return Json.DecodeDict(sr.ReadToEnd());
            }
            catch (WebException ex) { return ThrowErr(ex); }
        }

        public static Dictionary<string, object> Post(string path, object body)
        {
            try
            {
                using (HttpWebResponse res = GetResp("POST", path, Json.Encode(body), 30000))
                using (StreamReader sr = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                    return Json.DecodeDict(sr.ReadToEnd());
            }
            catch (WebException ex) { return ThrowErr(ex); }
        }

        static Dictionary<string, object> ThrowErr(WebException ex)
        {
            ReadError(ex);
            return null; // unreachable
        }

        // Streaming bot chat. Calls onToken per token on the CALLER thread.
        // Throws ApiError on failure. Returns full text.
        public static string ChatStream(string convId, List<Dictionary<string, string>> messages,
            TokenHandler onToken, Func<bool> cancelled)
        {
            Dictionary<string, object> payload = new Dictionary<string, object>();
            payload["conversation_id"] = convId;
            List<object> msgs = new List<object>();
            foreach (Dictionary<string, string> m in messages)
            {
                Dictionary<string, object> mm = new Dictionary<string, object>();
                mm["role"] = m["role"]; mm["content"] = m["content"];
                msgs.Add(mm);
            }
            payload["messages"] = msgs;
            string chatBody = Json.Encode(payload);
            StringBuilder full = new StringBuilder();
            try
            {
                using (HttpWebResponse res = GetResp("POST", "/api/bots/" + Slug + "/chat", chatBody, 150000))
                using (Stream s = res.GetResponseStream())
                using (StreamReader sr = new StreamReader(s, Encoding.UTF8))
                {
                    string line;
                    while ((line = sr.ReadLine()) != null)
                    {
                        if (cancelled != null && cancelled()) break;
                        line = line.Trim();
                        if (!line.StartsWith("data:")) continue;
                        string data = line.Substring(5).Trim();
                        if (data == "[DONE]") continue;
                        Dictionary<string, object> j;
                        try { j = Json.DecodeDict(data); }
                        catch { continue; }
                        if (j == null) continue;
                        string err = Json.Str(j, "error");
                        if (err != "") throw new ApiError((int)res.StatusCode, err);
                        if (j.ContainsKey("token") && j["token"] != null)
                        {
                            string tok = j["token"].ToString();
                            full.Append(tok);
                            if (onToken != null) onToken(tok);
                        }
                    }
                }
            }
            catch (WebException ex) { ReadError(ex); }
            return full.ToString();
        }
    }
}
