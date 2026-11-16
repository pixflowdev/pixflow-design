using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Launched from a temporary copy so the installer can replace the Bridge.
internal sealed class UpdaterWindow : Form
{
    private static readonly Color Surface = Color.FromArgb(26, 26, 26);
    private static readonly Color Accent = Color.FromArgb(20, 110, 245);
    private readonly Process owner;
    private readonly string stateFile;
    private readonly string grantFile;
    private readonly string launcher;
    private readonly Timer timer = new Timer { Interval = 50 };
    private readonly Label heading;
    private readonly Label detail;
    private readonly Panel statusIcon;
    private readonly Panel bar;
    private readonly Button done;
    private bool installing;
    private bool finished;
    private int progress = -1;
    private int tick;

    [STAThread]
    private static void Main(string[] args)
    {
        int ownerId;
        if (args.Length != 4 || !int.TryParse(args[0], out ownerId)) return;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (var owner = Process.GetProcessById(ownerId))
        using (var window = new UpdaterWindow(owner, args[1], args[2], args[3]))
            Application.Run(window);
    }

    private UpdaterWindow(Process owner, string stateFile, string grantFile, string launcher)
    {
        this.owner = owner;
        this.stateFile = stateFile;
        this.grantFile = grantFile;
        this.launcher = launcher;
        Text = "Pixflow Design Bridge";
        ClientSize = new Size(464, 278);
        BackColor = Surface;
        ForeColor = Color.WhiteSmoke;
        Font = new Font("Segoe UI", 10);
        AutoScaleMode = AutoScaleMode.Dpi;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        TopMost = true;
        DoubleBuffered = true;

        AddLabel("Pixflow Design Bridge", 28, 22, 10, Color.FromArgb(172, 177, 185), FontStyle.Regular);
        statusIcon = new Panel { Bounds = new Rectangle(32, 78, 36, 36) };
        statusIcon.Paint += PaintStatusIcon;
        Controls.Add(statusIcon);
        heading = AddLabel("", 78, 36, 18, ForeColor, FontStyle.Bold);
        heading.Left = 82;
        heading.Width = 350;
        detail = AddLabel("", 130, 50, 10, Color.FromArgb(179, 183, 191), FontStyle.Regular);
        detail.AccessibleRole = AccessibleRole.StatusBar;
        bar = new Panel {
            Bounds = new Rectangle(32, 204, 400, 6),
            AccessibleName = "Update progress", AccessibleRole = AccessibleRole.ProgressBar
        };
        bar.Paint += PaintProgress;
        Controls.Add(bar);
        done = new SquircleButton {
            Text = "Done", Bounds = new Rectangle(332, 204, 100, 40), Visible = false,
            FlatStyle = FlatStyle.Flat, BackColor = Accent, ForeColor = Color.White
        };
        done.Click += delegate { Close(); };
        Controls.Add(done);
        Shown += delegate {
            File.WriteAllText(Path.Combine(Path.GetDirectoryName(stateFile), "ready"), "");
            TopMost = false;
        };
        timer.Tick += ReadProgress;
        timer.Start();
        ShowStage("Checking for updates", "Looking for the latest Windows release.");
    }

    protected override void WndProc(ref Message message)
    {
        const int close = 0x10;
        if (message.Msg == close && !finished) return;

        base.WndProc(ref message);
        const int hitTest = 0x84;
        const int client = 1;
        const int caption = 2;
        if (message.Msg == hitTest && message.Result == (IntPtr)client && heading != null)
        {
            long position = message.LParam.ToInt64();
            Point pointer = PointToClient(new Point((short)(position & 0xffff), (short)((position >> 16) & 0xffff)));
            if (pointer.Y >= 0 && pointer.Y < heading.Top)
                message.Result = (IntPtr)caption;
        }
    }

    private static GraphicsPath RoundedOutline(RectangleF bounds, float radius)
    {
        var path = new GraphicsPath();
        float diameter = radius * 2;
        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        if (Width <= 0 || Height <= 0) return;
        using (var outline = RoundedOutline(ClientRectangle, 18 * DeviceDpi / 96f))
        {
            var previous = Region;
            Region = new Region(outline);
            if (previous != null) previous.Dispose();
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using (var border = new Pen(Color.FromArgb(57, 60, 66)))
        using (var outline = RoundedOutline(new RectangleF(.5f, .5f, Width - 1, Height - 1), 18 * DeviceDpi / 96f))
            e.Graphics.DrawPath(border, outline);
    }

    private void PaintStatusIcon(object sender, PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        float scale = statusIcon.Width / 36f;
        e.Graphics.ScaleTransform(scale, scale);
        using (var background = new SolidBrush(Color.FromArgb(29, 43, 65)))
        using (var outline = RoundedOutline(new RectangleF(0, 0, 36, 36), 11))
        using (var stroke = new Pen(Color.FromArgb(110, 166, 255), 2))
        {
            e.Graphics.FillPath(background, outline);
            stroke.StartCap = stroke.EndCap = LineCap.Round;
            if (finished && (heading.Text == "Update complete" || heading.Text == "You’re up to date"))
                e.Graphics.DrawLines(stroke, new[] { new PointF(11, 18), new PointF(16, 23), new PointF(25, 13) });
            else if (finished)
            {
                e.Graphics.DrawLine(stroke, 18, 10, 18, 20);
                e.Graphics.DrawLine(stroke, 18, 25, 18, 25.5f);
            }
            else
                e.Graphics.DrawArc(stroke, 10, 10, 16, 16, tick * 12 % 360, 255);
        }
    }

    private sealed class SquircleButton : Button
    {
        private bool hovered;

        protected override void OnMouseEnter(EventArgs e)
        {
            base.OnMouseEnter(e);
            hovered = true;
            Invalidate();
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            hovered = false;
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            float w = ClientSize.Width - 1;
            float h = ClientSize.Height - 1;
            float r = h * 0.42f;
            using (var shape = new GraphicsPath())
            using (var brush = new SolidBrush(hovered ? Color.FromArgb(18, 100, 225) : BackColor))
            {
                shape.AddBezier(0, r, 0, 0, 0, 0, r, 0);
                shape.AddLine(r, 0, w - r, 0);
                shape.AddBezier(w - r, 0, w, 0, w, 0, w, r);
                shape.AddLine(w, r, w, h - r);
                shape.AddBezier(w, h - r, w, h, w, h, w - r, h);
                shape.AddLine(w - r, h, r, h);
                shape.AddBezier(r, h, 0, h, 0, h, 0, h - r);
                shape.CloseFigure();
                e.Graphics.Clear(Parent.BackColor);
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                e.Graphics.FillPath(brush, shape);
            }
            TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, ForeColor,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            if (Focused && ShowFocusCues)
                ControlPaint.DrawFocusRectangle(e.Graphics, Rectangle.Inflate(ClientRectangle, -8, -5));
        }
    }

    private Label AddLabel(string text, int top, int height, int size, Color color, FontStyle style)
    {
        var label = new Label {
            Text = text, ForeColor = color, Bounds = new Rectangle(32, top, 400, height),
            Font = new Font(Font.FontFamily, size, style)
        };
        Controls.Add(label);
        return label;
    }

    private void ShowStage(string title, string description, int percent = -1)
    {
        if (heading.Text != title) heading.Text = title;
        if (detail.Text != description) detail.Text = description;
        progress = percent;
        bar.Invalidate();
        statusIcon.Invalidate();
    }

    private void PaintProgress(object sender, PaintEventArgs args)
    {
        var area = bar.ClientRectangle;
        args.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using (var clip = RoundedOutline(area, area.Height / 2f)) args.Graphics.SetClip(clip);
        using (var track = new SolidBrush(Color.FromArgb(52, 58, 68)))
        using (var fill = new SolidBrush(Accent))
        {
            args.Graphics.FillRectangle(track, area);
            if (progress >= 0)
                args.Graphics.FillRectangle(fill, 0, 0, area.Width * progress / 100, area.Height);
            else
                args.Graphics.FillRectangle(fill, tick * 10 % (area.Width + 92) - 92, 0, 92, area.Height);
        }
    }

    private void ReadProgress(object sender, EventArgs args)
    {
        tick++;
        if (installing) { bar.Invalidate(); statusIcon.Invalidate(); return; }
        try
        {
            if (File.Exists(grantFile))
            {
                string[] grant = File.ReadAllLines(grantFile);
                if (grant.Length != 2 || !Path.IsPathRooted(grant[0]) || !File.Exists(grant[0]) ||
                    !System.Text.RegularExpressions.Regex.IsMatch(grant[1], @"^\d+\.\d+\.\d+$"))
                {
                    Complete("The update couldn’t start", "The verified installer was unavailable. Try again from WordPress.");
                    return;
                }
                installing = true;
                ShowStage("Installing update", "The Bridge will close while its files are replaced.");
                Task.Run(() => Apply(grant[0], grant[1]));
                return;
            }
            if (owner.HasExited)
            {
                Complete("The Bridge closed", "Open the Bridge and try the update again from WordPress.");
                return;
            }
            string[] state = File.ReadAllLines(stateFile);
            switch (state.Length == 0 ? "" : state[0])
            {
                case "downloading":
                    int percent = -1;
                    bool known = state.Length > 1 && int.TryParse(state[1], out percent) && percent >= 0 && percent <= 100;
                    ShowStage("Downloading update", known ? percent + "% downloaded" : "Downloading the Windows update.", known ? percent : -1);
                    break;
                case "opening":
                    ShowStage("Verifying update", "Checking the downloaded installer before restarting the Bridge.");
                    break;
                case "up-to-date":
                    Complete("You’re up to date", "This computer already has the latest Pixflow Design Bridge.");
                    break;
                case "busy":
                    Complete("The Bridge is still working", "Wait for active work to finish, then try again from WordPress.");
                    break;
                case "failed":
                    Complete("The update couldn’t start", "Check your connection and try again from WordPress.");
                    break;
                default:
                    bar.Invalidate();
                    statusIcon.Invalidate();
                    break;
            }
        }
        catch (IOException) { /* A progress write can overlap this read. */ }
    }

    private async Task Apply(string installer, string version)
    {
        try
        {
            if (!owner.WaitForExit(60000))
            {
                Finish("The Bridge is still open", "Close the Bridge and try again. Your installed version is unchanged.");
                return;
            }
            using (var process = Process.Start(new ProcessStartInfo(installer, "/S /currentuser") {
                UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Path.GetDirectoryName(installer)
            }))
            {
                if (!process.WaitForExit(600000))
                {
                    Finish("Installation is still running", "Wait for installation to finish before opening the Bridge.");
                    return;
                }
                if (process.ExitCode != 0)
                {
                    StartBridge();
                    Finish("The update couldn’t finish", "The Windows installer returned error " + process.ExitCode + ".");
                    return;
                }
            }
            BeginInvoke(new Action(() => ShowStage("Restarting the Bridge", "Checking that the new version is ready to connect.")));
            if (!IsReady(version)) StartBridge();
            var elapsed = Stopwatch.StartNew();
            while (elapsed.ElapsedMilliseconds < 90000)
            {
                if (IsReady(version))
                {
                    Finish("Update complete", "Pixflow Design Bridge " + version + " is ready. You can return to WordPress.");
                    return;
                }
                await Task.Delay(500).ConfigureAwait(false);
            }
            Finish("The Bridge hasn’t reconnected", "Installation finished. Open the Bridge before returning to WordPress.");
        }
        catch (Exception)
        {
            Finish("The Bridge update stopped", "Open the Bridge and check its version before trying again.");
        }
    }

    private void StartBridge()
    {
        using (Process.Start(new ProcessStartInfo(launcher) {
            UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(launcher)
        })) { }
    }

    private static bool IsReady(string version)
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:7456/api/health");
            request.Proxy = null;
            request.AllowAutoRedirect = false;
            request.KeepAlive = false;
            request.Timeout = 1000;
            request.ReadWriteTimeout = 1000;
            using (var response = request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
            {
                var data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
                object product, current, ready;
                return data != null && data.TryGetValue("product", out product) && Equals(product, "pixflow-design-bridge") &&
                    data.TryGetValue("version", out current) && Equals(current, version) &&
                    data.TryGetValue("ok", out ready) && Equals(ready, true);
            }
        }
        catch (WebException) { return false; }
        catch (ArgumentException) { return false; }
        catch (InvalidOperationException) { return false; }
    }

    private void Finish(string title, string description)
    {
        BeginInvoke(new Action(() => Complete(title, description)));
    }

    private void Complete(string title, string description)
    {
        finished = true;
        timer.Stop();
        ShowStage(title, description);
        bar.Visible = false;
        done.Visible = true;
        AcceptButton = done;
        if (installing)
        {
            try { File.Delete(grantFile); File.Delete(stateFile); }
            catch (IOException) { }
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) timer.Dispose();
        base.Dispose(disposing);
    }
}
