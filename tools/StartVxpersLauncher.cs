using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.NetworkInformation;
using System.ServiceProcess;
using System.Threading;
using System.Windows.Forms;

public sealed class LauncherForm : Form
{
    private readonly string root;
    private readonly string stateDir;
    private readonly string serverDir;
    private readonly string clientDir;
    private readonly string serverScript;
    private readonly string clientScript;

    private ComboBox serverMode;
    private ComboBox clientMode;
    private CheckBox installDeps;
    private CheckBox buildClient;

    private Button startButton;
    private Button stopButton;
    private Button restartButton;
    private Button openStoreButton;
    private Button clearButton;

    private Label serverStatus;
    private Label clientStatus;
    private Label redisStatus;
    private Label dbStatus;
    private RichTextBox logBox;
    private System.Windows.Forms.Timer statusTimer;

    [STAThread]
    public static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new LauncherForm());
    }

    public LauncherForm()
    {
        root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        if (!File.Exists(Path.Combine(root, "launcher.ps1")) && File.Exists(Path.Combine(root, "..", "launcher.ps1")))
        {
            root = Path.GetFullPath(Path.Combine(root, ".."));
        }

        serverDir = Path.Combine(root, "server");
        clientDir = Path.Combine(root, "client");
        serverScript = Path.Combine(serverDir, "run-server.ps1");
        clientScript = Path.Combine(clientDir, "run-client.ps1");
        stateDir = Path.Combine(root, ".script-state");
        Directory.CreateDirectory(stateDir);

        InitializeComponent();
        Append("SYSTEM", "✨ VxperS Control Center Ready. Click [Start All] to launch services.", Color.FromArgb(56, 189, 248));

        statusTimer = new System.Windows.Forms.Timer { Interval = 2000 };
        statusTimer.Tick += delegate { UpdateStatusIndicators(); };
        statusTimer.Start();
        UpdateStatusIndicators();
    }

    private void InitializeComponent()
    {
        Text = "⚡ VxperS Control Center";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(860, 680);
        ClientSize = new Size(960, 720);
        BackColor = Color.FromArgb(2, 6, 23); // Slate 950
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 9F);

        // Header Panel
        var header = new Panel { Location = new Point(0, 0), Size = new Size(960, 80), Dock = DockStyle.Top, BackColor = Color.FromArgb(15, 23, 42) };
        var title = new Label { Text = "⚡ VXPERS CONTROL CENTER", AutoSize = true, Font = new Font("Segoe UI", 16F, FontStyle.Bold), ForeColor = Color.FromArgb(6, 182, 212), Location = new Point(24, 16) };
        var subtitle = new Label { Text = "Production & Dev Manager · Store & Storage Management", AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184), Font = new Font("Segoe UI", 9F), Location = new Point(26, 48) };
        header.Controls.Add(title);
        header.Controls.Add(subtitle);
        Controls.Add(header);

        // Settings Box
        var settings = new GroupBox { Text = " ⚙️ Configuration & Launch Modes ", ForeColor = Color.FromArgb(203, 213, 225), Location = new Point(24, 96), Size = new Size(912, 86), Font = new Font("Segoe UI", 9F, FontStyle.Bold) };
        
        var lblServer = new Label { Text = "Server:", AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184), Location = new Point(16, 36) };
        serverMode = NewComboBox(new[] { "start", "dev" }, 72, 32, "Server launch mode");
        
        var lblClient = new Label { Text = "Client:", AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184), Location = new Point(220, 36) };
        clientMode = NewComboBox(new[] { "preview (4173)", "dev (5173)" }, 272, 32, "Client launch mode");
        
        installDeps = new CheckBox { Text = "Install dependencies", AutoSize = true, ForeColor = Color.FromArgb(226, 232, 240), Location = new Point(440, 35), Font = new Font("Segoe UI", 9F) };
        buildClient = new CheckBox { Text = "Rebuild client", AutoSize = true, ForeColor = Color.FromArgb(226, 232, 240), Location = new Point(610, 35), Checked = false, Font = new Font("Segoe UI", 9F) };
        
        settings.Controls.Add(lblServer);
        settings.Controls.Add(serverMode);
        settings.Controls.Add(lblClient);
        settings.Controls.Add(clientMode);
        settings.Controls.Add(installDeps);
        settings.Controls.Add(buildClient);
        Controls.Add(settings);

        // Action Buttons Row
        startButton = NewButton("🚀 Start All", Color.FromArgb(8, 145, 178), new Point(24, 196), StartAll);
        stopButton = NewButton("🛑 Stop All", Color.FromArgb(190, 24, 93), new Point(164, 196), delegate { StopAll("requested by user"); });
        restartButton = NewButton("🔄 Restart", Color.FromArgb(109, 40, 217), new Point(304, 196), delegate { StopAll("restarting"); StartAll(null, EventArgs.Empty); });
        openStoreButton = NewButton("🛒 Web Store", Color.FromArgb(5, 150, 105), new Point(444, 196), delegate { OpenWebStore(); });
        clearButton = NewButton("🧹 Clear Log", Color.FromArgb(51, 65, 85), new Point(584, 196), delegate { logBox.Clear(); });

        Controls.Add(startButton);
        Controls.Add(stopButton);
        Controls.Add(restartButton);
        Controls.Add(openStoreButton);
        Controls.Add(clearButton);

        // Status Indicators Panel
        var statusPanel = new Panel { Location = new Point(24, 252), Size = new Size(912, 48), BackColor = Color.FromArgb(15, 23, 42) };
        serverStatus = NewStatus("API Server (3001)", 16, 14);
        clientStatus = NewStatus("Web Client (4173/5173)", 240, 14);
        redisStatus = NewStatus("Redis Cache (6379)", 500, 14);
        dbStatus = NewStatus("PostgreSQL (5432)", 710, 14);
        statusPanel.Controls.Add(serverStatus);
        statusPanel.Controls.Add(clientStatus);
        statusPanel.Controls.Add(redisStatus);
        statusPanel.Controls.Add(dbStatus);
        Controls.Add(statusPanel);

        // Log Console
        logBox = new RichTextBox
        {
            Location = new Point(24, 312),
            Size = new Size(912, 350),
            Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
            ReadOnly = true,
            BorderStyle = BorderStyle.None,
            BackColor = Color.FromArgb(10, 15, 30),
            ForeColor = Color.FromArgb(203, 213, 225),
            Font = new Font("Consolas", 9.5F),
            DetectUrls = false
        };
        Controls.Add(logBox);

        FormClosing += delegate { StopAll("launcher exit"); };
    }

    private ComboBox NewComboBox(string[] values, int x, int y, string label)
    {
        var combo = new ComboBox
        {
            Location = new Point(x, y),
            Width = 130,
            DropDownStyle = ComboBoxStyle.DropDownList,
            BackColor = Color.FromArgb(30, 41, 59),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9F)
        };
        combo.Items.AddRange(values);
        combo.SelectedIndex = 0;
        return combo;
    }

    private Label NewStatus(string text, int x, int y)
    {
        return new Label
        {
            Text = "○ " + text,
            AutoSize = true,
            Location = new Point(x, y),
            ForeColor = Color.FromArgb(148, 163, 184),
            Font = new Font("Segoe UI", 9.5F, FontStyle.Bold)
        };
    }

    private Button NewButton(string text, Color color, Point location, EventHandler handler)
    {
        var button = new Button
        {
            Text = text,
            Location = location,
            Size = new Size(130, 42),
            FlatStyle = FlatStyle.Flat,
            BackColor = color,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9.5F, FontStyle.Bold),
            Cursor = Cursors.Hand
        };
        button.FlatAppearance.BorderSize = 0;
        button.Click += handler;
        return button;
    }

    private bool IsPortListening(int port)
    {
        try
        {
            var ipProps = IPGlobalProperties.GetIPGlobalProperties();
            var listeners = ipProps.GetActiveTcpListeners();
            foreach (var ep in listeners)
            {
                if (ep.Port == port) return true;
            }
        }
        catch { }
        return false;
    }

    private int GetActiveClientPort()
    {
        if (IsPortListening(4173)) return 4173;
        if (IsPortListening(5173)) return 5173;
        if (IsPortListening(5000)) return 5000;
        return clientMode.SelectedItem != null && clientMode.SelectedItem.ToString().Contains("dev") ? 5173 : 4173;
    }

    private void UpdateStatusIndicators()
    {
        if (IsDisposed) return;

        bool serverOn = IsPortListening(3001);
        int clientPort = GetActiveClientPort();
        bool clientOn = IsPortListening(4173) || IsPortListening(5173) || IsPortListening(5000);
        bool redisOn = IsPortListening(6379);
        bool dbOn = IsPortListening(5432);

        if (serverStatus != null && !serverStatus.IsDisposed)
        {
            serverStatus.Text = (serverOn ? "● " : "○ ") + "API Server (3001)";
            serverStatus.ForeColor = serverOn ? Color.FromArgb(34, 197, 94) : Color.FromArgb(148, 163, 184);
        }

        if (clientStatus != null && !clientStatus.IsDisposed)
        {
            clientStatus.Text = (clientOn ? "● " : "○ ") + "Web Client (" + clientPort + ")";
            clientStatus.ForeColor = clientOn ? Color.FromArgb(34, 197, 94) : Color.FromArgb(148, 163, 184);
        }

        if (redisStatus != null && !redisStatus.IsDisposed)
        {
            redisStatus.Text = (redisOn ? "● " : "○ ") + "Redis Cache (6379)";
            redisStatus.ForeColor = redisOn ? Color.FromArgb(244, 63, 94) : Color.FromArgb(148, 163, 184);
        }

        if (dbStatus != null && !dbStatus.IsDisposed)
        {
            dbStatus.Text = (dbOn ? "● " : "○ ") + "PostgreSQL (5432)";
            dbStatus.ForeColor = dbOn ? Color.FromArgb(56, 189, 248) : Color.FromArgb(148, 163, 184);
        }
    }

    private void Append(string tag, string message, Color? color = null)
    {
        if (IsDisposed) return;
        if (InvokeRequired)
        {
            try
            {
                Invoke(new Action(() => Append(tag, message, color)));
            }
            catch { }
            return;
        }

        var timeStr = "[" + DateTime.Now.ToString("HH:mm:ss") + "] ";
        logBox.SelectionStart = logBox.TextLength;
        logBox.SelectionLength = 0;
        logBox.SelectionColor = Color.FromArgb(100, 116, 139);
        logBox.AppendText(timeStr);

        logBox.SelectionColor = color ?? Color.FromArgb(56, 189, 248);
        logBox.AppendText("[" + tag + "] ");

        logBox.SelectionColor = Color.FromArgb(226, 232, 240);
        logBox.AppendText(message + "\n");
        logBox.ScrollToCaret();
    }

    private void StartAll(object sender, EventArgs args)
    {
        StopAll("starting new session");
        Append("LAUNCHER", "🚀 Starting all services...", Color.FromArgb(6, 182, 212));

        string cMode = clientMode.SelectedItem.ToString().Contains("dev") ? "dev" : "preview";
        string sMode = serverMode.SelectedItem.ToString();
        string installArg = installDeps.Checked ? " -Install" : "";
        string buildArg = buildClient.Checked ? " -Build" : "";

        // 1. Start Server
        try
        {
            var serverPsi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoExit -ExecutionPolicy Bypass -File \"" + serverScript + "\" -Mode " + sMode + installArg,
                WindowStyle = ProcessWindowStyle.Minimized,
                WorkingDirectory = serverDir
            };
            Process.Start(serverPsi);
            Append("SERVER", "Backend API server launching on http://localhost:3001", Color.FromArgb(34, 197, 94));
        }
        catch (Exception ex)
        {
            Append("SERVER", "Failed to start server: " + ex.Message, Color.FromArgb(244, 63, 94));
        }

        // 2. Start Client
        try
        {
            var clientPsi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoExit -ExecutionPolicy Bypass -File \"" + clientScript + "\" -Mode " + cMode + installArg + buildArg,
                WindowStyle = ProcessWindowStyle.Minimized,
                WorkingDirectory = clientDir
            };
            Process.Start(clientPsi);
            string expectedPort = (cMode == "dev") ? "5173" : "4173";
            Append("CLIENT", "Web client launching on port " + expectedPort, Color.FromArgb(34, 197, 94));
        }
        catch (Exception ex)
        {
            Append("CLIENT", "Failed to start client: " + ex.Message, Color.FromArgb(244, 63, 94));
        }

        // 3. Background Async Waiter for Ready State
        var bg = new BackgroundWorker();
        bg.DoWork += delegate
        {
            int targetClientPort = (cMode == "dev") ? 5173 : 4173;
            bool serverReady = false;
            bool clientReady = false;

            for (int i = 0; i < 30; i++)
            {
                Thread.Sleep(500);
                if (!serverReady && IsPortListening(3001)) serverReady = true;
                if (!clientReady && IsPortListening(targetClientPort)) clientReady = true;
                if (serverReady && clientReady) break;
            }

            if (serverReady && clientReady)
            {
                Append("READY", "✨ All services are ONLINE! Web: http://localhost:" + targetClientPort + " | API: http://localhost:3001", Color.FromArgb(34, 197, 94));
            }
            else if (serverReady)
            {
                Append("READY", "⚡ Backend server is ready on http://localhost:3001 (Client is initializing...)", Color.FromArgb(245, 158, 11));
            }
            else
            {
                Append("READY", "⏳ Services are starting in background.", Color.FromArgb(56, 189, 248));
            }
        };
        bg.RunWorkerAsync();
    }

    private void StopAll(string reason)
    {
        Append("LAUNCHER", "🛑 Stopping project services (" + reason + ")...", Color.FromArgb(245, 158, 11));

        // 1. Stop saved PIDs from state directory if valid
        try
        {
            var pidFiles = new[] { "server.pid", "client.pid", "tunnel.pid" };
            foreach (var file in pidFiles)
            {
                var full = Path.Combine(stateDir, file);
                if (File.Exists(full))
                {
                    try
                    {
                        var raw = File.ReadAllText(full).Trim();
                        int pid;
                        if (int.TryParse(raw, out pid))
                        {
                            var proc = Process.GetProcessById(pid);
                            if (proc != null && !proc.HasExited)
                            {
                                proc.Kill();
                            }
                        }
                    }
                    catch { }
                    try { File.Delete(full); } catch { }
                }
            }
        }
        catch { }

        // 2. Stop processes listening specifically on project ports (3001, 5173, 5000, 4173)
        var ports = new[] { 3001, 5173, 5000, 4173 };
        foreach (var port in ports)
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-Command \"Get-NetTCPConnection -LocalPort " + port + " -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }\"",
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true
                };
                var p = Process.Start(psi);
                if (p != null) p.WaitForExit(1500);
            }
            catch { }
        }

        Append("LAUNCHER", "✅ Project services stopped cleanly.", Color.FromArgb(34, 197, 94));
        UpdateStatusIndicators();
    }

    private void OpenWebStore()
    {
        int port = GetActiveClientPort();
        if (!IsPortListening(port) && !IsPortListening(3001))
        {
            Append("BROWSER", "⚠️ Services are offline. Please click [🚀 Start All] first.", Color.FromArgb(245, 158, 11));
            return;
        }
        OpenUrl("http://localhost:" + port);
    }

    private void OpenUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
            Append("BROWSER", "Opened " + url, Color.FromArgb(56, 189, 248));
        }
        catch (Exception ex)
        {
            Append("BROWSER", "Could not open browser: " + ex.Message, Color.FromArgb(244, 63, 94));
        }
    }
}
