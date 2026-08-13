using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Management;
using System.Windows.Forms;

public sealed class LauncherForm : Form
{
    private readonly string root;
    private readonly string stateDir;
    private readonly string serverPidFile;
    private readonly string clientPidFile;
    private readonly string mangaPidFile;
    private readonly string tunnelPidFile;

    private Process serverProcess;
    private Process clientProcess;
    private Process mangaProcess;
    private Process tunnelProcess;
    private ComboBox serverMode;
    private ComboBox clientMode;
    private CheckBox installDeps;
    private CheckBox buildClient;
    private CheckBox startTunnel;
    private Button startButton;
    private Button stopButton;
    private Button restartButton;
    private Button openButton;
    private Button clearButton;
    private Label serverStatus;
    private Label clientStatus;
    private Label mangaStatus;
    private Label tunnelStatus;
    private RichTextBox logBox;

    public LauncherForm()
    {
        root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        stateDir = Path.Combine(root, ".script-state");
        serverPidFile = Path.Combine(stateDir, "server.pid");
        clientPidFile = Path.Combine(stateDir, "client.pid");
        mangaPidFile = Path.Combine(stateDir, "mangaocr.pid");
        tunnelPidFile = Path.Combine(stateDir, "tunnel.pid");
        Directory.CreateDirectory(stateDir);
        InitializeComponent();
        Append("Launcher", "Ready. Start All launches API server, web client, MangaOCR, and Cloudflare Tunnel when configured.");
    }

    private void InitializeComponent()
    {
        Text = "VxperS Launcher";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(760, 560);
        ClientSize = new Size(900, 650);
        BackColor = Color.FromArgb(15, 23, 42);
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 9F);

        var title = new Label { Text = "VxperS Control Center", AutoSize = true, Font = new Font("Segoe UI", 18F, FontStyle.Bold), ForeColor = Color.White, Location = new Point(22, 18) };
        var subtitle = new Label { Text = "Server, web client, and MangaOCR service", AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184), Location = new Point(25, 52) };
        Controls.Add(title);
        Controls.Add(subtitle);

        var settings = new GroupBox { Text = "Launch settings", ForeColor = Color.FromArgb(203, 213, 225), Location = new Point(22, 85), Size = new Size(856, 86) };
        serverMode = NewComboBox(new[] { "dev", "start" }, 16, 34, "Server mode");
        clientMode = NewComboBox(new[] { "dev", "preview" }, 170, 34, "Client mode");
        clientMode.SelectedIndex = 1;
        installDeps = new CheckBox { Text = "Install dependencies", AutoSize = true, ForeColor = Color.FromArgb(226, 232, 240), Location = new Point(340, 36) };
        buildClient = new CheckBox { Text = "Build client", AutoSize = true, ForeColor = Color.FromArgb(226, 232, 240), Location = new Point(515, 36), Checked = true };
        startTunnel = new CheckBox { Text = "Cloudflare tunnel", AutoSize = true, ForeColor = Color.FromArgb(226, 232, 240), Location = new Point(640, 36), Checked = File.Exists(Path.Combine(root, "cloudflare", "config.yml")) || !String.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("CLOUDFLARE_TUNNEL_TOKEN")) };
        settings.Controls.Add(serverMode);
        settings.Controls.Add(clientMode);
        settings.Controls.Add(installDeps);
        settings.Controls.Add(buildClient);
        settings.Controls.Add(startTunnel);
        Controls.Add(settings);

        startButton = NewButton("Start All", Color.FromArgb(8, 145, 178), new Point(22, 188), StartAll);
        stopButton = NewButton("Stop All", Color.FromArgb(190, 24, 93), new Point(142, 188), delegate { StopAll("requested by user"); });
        restartButton = NewButton("Restart", Color.FromArgb(109, 40, 217), new Point(262, 188), delegate { StopAll("restarting"); StartAll(null, EventArgs.Empty); });
        openButton = NewButton("Open Web App", Color.FromArgb(5, 150, 105), new Point(382, 188), delegate { OpenClient(); });
        clearButton = NewButton("Clear Log", Color.FromArgb(71, 85, 105), new Point(522, 188), delegate { logBox.Clear(); });
        Controls.Add(startButton); Controls.Add(stopButton); Controls.Add(restartButton); Controls.Add(openButton); Controls.Add(clearButton);

        serverStatus = NewStatus("API server · port 3001", 22, 246, Color.FromArgb(148, 163, 184));
        clientStatus = NewStatus("Web client · port 5173 / 4173", 22, 278, Color.FromArgb(148, 163, 184));
        mangaStatus = NewStatus("MangaOCR · port 9444", 22, 310, Color.FromArgb(34, 211, 238));
        tunnelStatus = NewStatus("Cloudflare tunnel · vxpers.com", 22, 342, Color.FromArgb(56, 189, 248));
        Controls.Add(serverStatus); Controls.Add(clientStatus); Controls.Add(mangaStatus); Controls.Add(tunnelStatus);

        logBox = new RichTextBox { Location = new Point(22, 386), Size = new Size(856, 240), Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right, ReadOnly = true, BorderStyle = BorderStyle.FixedSingle, BackColor = Color.FromArgb(2, 6, 23), ForeColor = Color.FromArgb(203, 213, 225), Font = new Font("Cascadia Mono", 9F), DetectUrls = false };
        Controls.Add(logBox);
        FormClosing += delegate { StopAll("launcher closing"); };
    }

    private ComboBox NewComboBox(string[] values, int x, int y, string label)
    {
        var combo = new ComboBox { Location = new Point(x, y), Width = 136, DropDownStyle = ComboBoxStyle.DropDownList, BackColor = Color.FromArgb(30, 41, 59), ForeColor = Color.White };
        combo.Items.AddRange(values);
        combo.SelectedIndex = 0;
        var caption = new ToolTip();
        caption.SetToolTip(combo, label);
        return combo;
    }

    private Label NewStatus(string text, int x, int y, Color color)
    {
        return new Label { Text = "● " + text + " · stopped", AutoSize = true, Location = new Point(x, y), ForeColor = color, Font = new Font("Segoe UI", 10F, FontStyle.Bold) };
    }

    private Button NewButton(string text, Color color, Point location, EventHandler handler)
    {
        var button = new Button { Text = text, Location = location, Size = new Size(108, 36), FlatStyle = FlatStyle.Flat, BackColor = color, ForeColor = Color.White, Font = new Font("Segoe UI", 9F, FontStyle.Bold) };
        button.FlatAppearance.BorderSize = 0;
        button.Click += handler;
        return button;
    }

    private void StartAll(object sender, EventArgs args)
    {
        if (!File.Exists(Path.Combine(root, "server", "run-server.ps1")) || !File.Exists(Path.Combine(root, "manga_ocr_server", "run_manga_ocr.ps1")))
        {
            Append("Launcher", "Cannot find project scripts. Run this executable from the project root.");
            return;
        }
        StopAll("starting a new session");
        FreeListeningPorts(new[] { 3001, 5173, 4173, 9444 });
        startButton.Enabled = false;
        try
        {
            string install = installDeps.Checked ? " -Install" : "";
            string serverArgs = "-Mode " + QuoteArg(serverMode.SelectedItem.ToString()) + install;
            string clientArgs = "-Mode " + QuoteArg(clientMode.SelectedItem.ToString()) + install;
            bool builtClient = false;
            if (buildClient.Checked && !installDeps.Checked && RunOneShot("Client build", Path.Combine(root, "client"), "node.exe", Quote(Path.Combine("node_modules", "vite", "bin", "vite.js")) + " build"))
            {
                builtClient = true;
            }
            else if (buildClient.Checked && !installDeps.Checked)
            {
                Append("Launcher", "Client build failed; no services were started.");
                return;
            }
            if (builtClient && clientMode.SelectedItem.ToString() == "preview")
            {
                clientArgs += " -SkipBuild";
            }
            mangaProcess = StartCommand("MangaOCR", Path.Combine(root, "manga_ocr_server"), Path.Combine(root, "manga_ocr_server", "run_manga_ocr.ps1"), install, mangaPidFile);
            serverProcess = StartCommand("Server", Path.Combine(root, "server"), Path.Combine(root, "server", "run-server.ps1"), serverArgs, serverPidFile);
            clientProcess = StartCommand("Client", Path.Combine(root, "client"), Path.Combine(root, "client", "run-client.ps1"), clientArgs, clientPidFile);
            if (startTunnel.Checked)
            {
                string tunnelConfig = Path.Combine(root, "cloudflare", "config.yml");
                string tunnelToken = Environment.GetEnvironmentVariable("CLOUDFLARE_TUNNEL_TOKEN");
                if (File.Exists(tunnelConfig) || !String.IsNullOrWhiteSpace(tunnelToken))
                {
                    tunnelProcess = StartCommand("Tunnel", Path.Combine(root, "cloudflare"), Path.Combine(root, "cloudflare", "run-tunnel.ps1"), "", tunnelPidFile);
                    tunnelStatus.Text = "● Cloudflare tunnel · vxpers.com · starting";
                }
                else
                {
                    Append("Launcher", "Cloudflare tunnel skipped: add cloudflare/config.yml or set CLOUDFLARE_TUNNEL_TOKEN.");
                    tunnelStatus.Text = "● Cloudflare tunnel · vxpers.com · not configured";
                }
            }
            else
            {
                tunnelStatus.Text = "● Cloudflare tunnel · vxpers.com · disabled";
            }
            serverStatus.Text = "● API server · port 3001 · starting";
            clientStatus.Text = "● Web client · " + (clientMode.SelectedItem.ToString() == "dev" ? "port 5173" : "port 4173") + " · starting";
            mangaStatus.Text = "● MangaOCR · port 9444 · starting";
            Append("Launcher", "All services have been started. OCR backend logs are prefixed [MangaOCR]. Tunnel logs use [Tunnel].");
        }
        catch (Exception ex)
        {
            Append("Launcher", "Start failed: " + ex.Message);
            StopAll("start failure");
        }
        finally { startButton.Enabled = true; }
    }

    private Process StartCommand(string label, string workingDirectory, string script, string scriptArgs, string pidFile)
    {
        var info = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoProfile -ExecutionPolicy Bypass -File " + Quote(script) + " " + scriptArgs,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            // Vite enables keyboard shortcuts only for a TTY. A GUI launcher
            // has no console input; give the child a stable pipe instead of
            // inheriting a broken console handle (which causes Node EPIPE).
            RedirectStandardInput = true,
            CreateNoWindow = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8,
            StandardErrorEncoding = System.Text.Encoding.UTF8
        };
        var process = new Process { StartInfo = info, EnableRaisingEvents = true };
        process.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { if (!String.IsNullOrWhiteSpace(e.Data)) Append(label, e.Data); };
        process.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { if (!String.IsNullOrWhiteSpace(e.Data)) Append(label + " error", e.Data); };
        process.Exited += delegate { BeginInvoke((Action)delegate { Append(label, "process exited"); UpdateStatus(label, false); }); };
        if (!process.Start()) throw new InvalidOperationException("Unable to start " + label);
        File.WriteAllText(pidFile, process.Id.ToString());
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        Append("Launcher", label + " started (PID " + process.Id + ").");
        return process;
    }

    private bool RunOneShot(string label, string workingDirectory, string fileName, string arguments)
    {
        var info = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        using (var process = new Process { StartInfo = info })
        {
            process.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { if (!String.IsNullOrWhiteSpace(e.Data)) Append(label, e.Data); };
            process.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { if (!String.IsNullOrWhiteSpace(e.Data)) Append(label + " error", e.Data); };
            Append("Launcher", label + " started.");
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            process.WaitForExit();
            return process.ExitCode == 0;
        }
    }

    private void StopAll(string reason)
    {
        StopTrackedProcess(serverProcess, serverPidFile, "Server", reason);
        StopTrackedProcess(clientProcess, clientPidFile, "Client", reason);
        StopTrackedProcess(mangaProcess, mangaPidFile, "MangaOCR", reason);
        StopTrackedProcess(tunnelProcess, tunnelPidFile, "Tunnel", reason);
        serverProcess = null; clientProcess = null; mangaProcess = null; tunnelProcess = null;
        serverStatus.Text = "● API server · port 3001 · stopped";
        clientStatus.Text = "● Web client · port 5173 / 4173 · stopped";
        mangaStatus.Text = "● MangaOCR · port 9444 · stopped";
        tunnelStatus.Text = "● Cloudflare tunnel · vxpers.com · stopped";
    }

    private void StopTrackedProcess(Process process, string pidFile, string label, string reason)
    {
        int pid = 0;
        if (process != null) pid = process.Id;
        if (pid == 0 && File.Exists(pidFile)) Int32.TryParse(File.ReadAllText(pidFile).Trim(), out pid);
        if (pid > 0) StopProcessTree(pid, label, reason);
        if (File.Exists(pidFile)) File.Delete(pidFile);
    }

    private void StopProcessTree(int pid, string label, string reason)
    {
        foreach (int childPid in GetChildProcessIds(pid)) StopProcessTree(childPid, label, reason);
        try
        {
            var process = Process.GetProcessById(pid);
            if (!process.HasExited) { Append("Launcher", "Stopping " + label + " (PID " + pid + "): " + reason); process.Kill(); }
        }
        catch (ArgumentException) { }
        catch (InvalidOperationException) { }
    }

    private void FreeListeningPorts(int[] ports)
    {
        foreach (int port in ports)
        {
            foreach (int pid in GetListeningProcessIds(port))
            {
                if (pid <= 0) continue;
                Append("Launcher", "Freeing port " + port + " (PID " + pid + ").");
                StopProcessTree(pid, "Port " + port, "port in use");
            }
        }
    }

    private IEnumerable<int> GetListeningProcessIds(int port)
    {
        var pids = new HashSet<int>();
        var info = new ProcessStartInfo
        {
            FileName = "netstat.exe",
            Arguments = "-ano -p TCP",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            CreateNoWindow = true
        };
        using (var process = Process.Start(info))
        {
            string output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();
            string portSuffix = ":" + port;
            foreach (string line in output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                if (line.IndexOf("LISTENING", StringComparison.OrdinalIgnoreCase) < 0) continue;
                string[] parts = line.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 5) continue;
                string localAddress = parts[1];
                if (!localAddress.EndsWith(portSuffix, StringComparison.Ordinal)) continue;
                int pid;
                if (Int32.TryParse(parts[parts.Length - 1], out pid) && pid > 0) pids.Add(pid);
            }
        }
        foreach (int pid in pids) yield return pid;
    }

    private IEnumerable<int> GetChildProcessIds(int parentPid)
    {
        using (var searcher = new ManagementObjectSearcher("SELECT ProcessId FROM Win32_Process WHERE ParentProcessId = " + parentPid))
        using (var rows = searcher.Get())
        {
            foreach (ManagementObject row in rows) yield return Convert.ToInt32((uint)row["ProcessId"]);
        }
    }

    private void OpenClient()
    {
        string url = "https://www.vxpers.com";
        if (!startTunnel.Checked || (!File.Exists(Path.Combine(root, "cloudflare", "config.yml")) && String.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("CLOUDFLARE_TUNNEL_TOKEN"))))
        {
            url = clientMode.SelectedItem != null && clientMode.SelectedItem.ToString() == "preview" ? "http://localhost:4173" : "http://localhost:5173";
        }
        try { Process.Start(url); } catch (Exception ex) { Append("Launcher", "Could not open browser: " + ex.Message); }
    }

    private void UpdateStatus(string label, bool running)
    {
        Label target = label == "Server" ? serverStatus : label == "Client" ? clientStatus : label == "Tunnel" ? tunnelStatus : mangaStatus;
        target.Text = target.Text.Split('·')[0] + "· " + (running ? "running" : "stopped");
    }

    private void Append(string source, string message)
    {
        if (IsDisposed) return;
        if (InvokeRequired) { BeginInvoke((Action)delegate { Append(source, message); }); return; }
        logBox.AppendText("[" + DateTime.Now.ToString("HH:mm:ss") + "] [" + source + "] " + message + Environment.NewLine);
        logBox.SelectionStart = logBox.TextLength;
        logBox.ScrollToCaret();
    }

    private static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    private static string QuoteArg(string value) { return value.IndexOf(' ') >= 0 ? Quote(value) : value; }
}

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new LauncherForm());
    }
}
