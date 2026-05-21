using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Management;
using System.Text;
using System.Windows.Forms;

public static class Program
{
    [STAThread]
    public static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new LauncherForm());
    }
}

public sealed class LauncherForm : Form
{
    private readonly string root;
    private readonly string stateDir;
    private readonly string serverPidFile;
    private readonly string clientPidFile;

    private Process serverProcess;
    private Process clientProcess;

    private readonly ComboBox serverMode = new ComboBox();
    private readonly ComboBox clientMode = new ComboBox();
    private readonly CheckBox installDeps = new CheckBox();
    private readonly CheckBox buildClient = new CheckBox();
    private readonly Button startButton = new Button();
    private readonly Button stopButton = new Button();
    private readonly Button restartButton = new Button();
    private readonly Button openButton = new Button();
    private readonly Button clearButton = new Button();
    private readonly Label serverStatus = new Label();
    private readonly Label clientStatus = new Label();
    private readonly RichTextBox logBox = new RichTextBox();

    public LauncherForm()
    {
        root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        stateDir = Path.Combine(root, ".script-state");
        serverPidFile = Path.Combine(stateDir, "server.pid");
        clientPidFile = Path.Combine(stateDir, "client.pid");

        Text = "Start Vxpers";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(980, 650);
        Size = new Size(1080, 720);
        BackColor = Color.FromArgb(13, 18, 32);
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 10F);

        BuildUi();
        UpdateButtons(false);
        FormClosing += OnFormClosing;
    }

    private void BuildUi()
    {
        var title = new Label
        {
            Text = "Vxpers Local Launcher",
            Font = new Font("Segoe UI Semibold", 24F),
            ForeColor = Color.FromArgb(225, 245, 255),
            AutoSize = true,
            Location = new Point(28, 22),
        };
        Controls.Add(title);

        var subtitle = new Label
        {
            Text = "Start server and client silently in the background. Logs stay here.",
            ForeColor = Color.FromArgb(145, 164, 190),
            AutoSize = true,
            Location = new Point(32, 72),
        };
        Controls.Add(subtitle);

        var panel = new Panel
        {
            Location = new Point(28, 112),
            Size = new Size(1010, 140),
            BackColor = Color.FromArgb(20, 28, 48),
        };
        Controls.Add(panel);

        ConfigureCombo(serverMode, new[] { "dev", "start" }, "dev", new Point(22, 48));
        ConfigureCombo(clientMode, new[] { "preview", "dev" }, "preview", new Point(178, 48));
        panel.Controls.Add(FieldLabel("Server", new Point(22, 24)));
        panel.Controls.Add(serverMode);
        panel.Controls.Add(FieldLabel("Client", new Point(178, 24)));
        panel.Controls.Add(clientMode);

        installDeps.Text = "Install deps first";
        installDeps.AutoSize = true;
        installDeps.ForeColor = Color.FromArgb(210, 224, 244);
        installDeps.Location = new Point(350, 50);
        panel.Controls.Add(installDeps);

        buildClient.Text = "Build client";
        buildClient.AutoSize = true;
        buildClient.Checked = true;
        buildClient.ForeColor = Color.FromArgb(210, 224, 244);
        buildClient.Location = new Point(500, 50);
        panel.Controls.Add(buildClient);

        ConfigureButton(startButton, "Start", Color.FromArgb(14, 165, 233), new Point(635, 38));
        ConfigureButton(stopButton, "Stop", Color.FromArgb(239, 68, 68), new Point(735, 38));
        ConfigureButton(restartButton, "Restart", Color.FromArgb(99, 102, 241), new Point(835, 38));
        ConfigureButton(openButton, "Open", Color.FromArgb(34, 197, 94), new Point(935, 38));
        panel.Controls.Add(startButton);
        panel.Controls.Add(stopButton);
        panel.Controls.Add(restartButton);
        panel.Controls.Add(openButton);

        serverStatus.Text = "Server: stopped";
        serverStatus.ForeColor = Color.FromArgb(148, 163, 184);
        serverStatus.AutoSize = true;
        serverStatus.Location = new Point(22, 100);
        panel.Controls.Add(serverStatus);

        clientStatus.Text = "Client: stopped";
        clientStatus.ForeColor = Color.FromArgb(148, 163, 184);
        clientStatus.AutoSize = true;
        clientStatus.Location = new Point(178, 100);
        panel.Controls.Add(clientStatus);

        clearButton.Text = "Clear log";
        clearButton.FlatStyle = FlatStyle.Flat;
        clearButton.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
        clearButton.ForeColor = Color.FromArgb(210, 224, 244);
        clearButton.BackColor = Color.FromArgb(15, 23, 42);
        clearButton.Location = new Point(915, 272);
        clearButton.Size = new Size(120, 34);
        Controls.Add(clearButton);

        logBox.Location = new Point(28, 316);
        logBox.Size = new Size(1010, 335);
        logBox.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        logBox.BackColor = Color.FromArgb(3, 7, 18);
        logBox.ForeColor = Color.FromArgb(226, 232, 240);
        logBox.BorderStyle = BorderStyle.None;
        logBox.Font = new Font("Cascadia Mono", 9F);
        logBox.ReadOnly = true;
        Controls.Add(logBox);

        startButton.Click += (s, e) => StartAll();
        stopButton.Click += (s, e) => StopAll("manual stop");
        restartButton.Click += (s, e) => { StopAll("restart"); StartAll(); };
        openButton.Click += (s, e) => OpenClient();
        clearButton.Click += (s, e) => logBox.Clear();
    }

    private static Label FieldLabel(string text, Point location)
    {
        return new Label
        {
            Text = text,
            Location = location,
            AutoSize = true,
            ForeColor = Color.FromArgb(148, 163, 184),
        };
    }

    private static void ConfigureCombo(ComboBox box, IEnumerable<string> items, string selected, Point location)
    {
        box.DropDownStyle = ComboBoxStyle.DropDownList;
        box.Items.AddRange(items.Cast<object>().ToArray());
        box.SelectedItem = selected;
        box.Location = location;
        box.Size = new Size(126, 32);
        box.FlatStyle = FlatStyle.Flat;
    }

    private static void ConfigureButton(Button button, string text, Color color, Point location)
    {
        button.Text = text;
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.ForeColor = Color.White;
        button.BackColor = color;
        button.Location = location;
        button.Size = new Size(86, 44);
    }

    private void StartAll()
    {
        Directory.CreateDirectory(stateDir);
        StopPreviousPid(serverPidFile, "server");
        StopPreviousPid(clientPidFile, "client");

        Append("launcher", "Starting background processes...");
        serverProcess = StartPowerShell(
            "server",
            Path.Combine(root, "server"),
            BuildServerCommand((string)serverMode.SelectedItem, installDeps.Checked),
            serverPidFile);
        clientProcess = StartPowerShell(
            "client",
            Path.Combine(root, "client"),
            BuildClientCommand((string)clientMode.SelectedItem, installDeps.Checked, buildClient.Checked),
            clientPidFile);

        UpdateButtons(true);
    }

    private static string BuildServerCommand(string mode, bool install)
    {
        var commands = new List<string>();
        if (install) commands.Add("npm install");
        commands.Add("if (-not (Test-Path 'node_modules')) { Write-Error 'server node_modules not found. Enable Install deps first.'; exit 1 }");
        commands.Add(mode == "dev" ? "npm run dev" : "npm run start");
        return string.Join("; ", commands);
    }

    private static string BuildClientCommand(string mode, bool install, bool build)
    {
        var commands = new List<string>();
        if (install) commands.Add("npm install");
        commands.Add("if (-not (Test-Path 'node_modules')) { Write-Error 'client node_modules not found. Enable Install deps first.'; exit 1 }");
        if (mode == "preview")
        {
            if (build) commands.Add("npm run build");
            commands.Add("npm run preview");
        }
        else
        {
            commands.Add("npm run dev");
        }
        return string.Join("; ", commands);
    }

    private Process StartPowerShell(string label, string workingDirectory, string command, string pidFile)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoProfile -ExecutionPolicy Bypass -Command " + Quote(command),
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
        process.OutputDataReceived += (s, e) => { if (e.Data != null) Append(label, e.Data); };
        process.ErrorDataReceived += (s, e) => { if (e.Data != null) Append(label, e.Data); };
        process.Exited += (s, e) =>
        {
            Append(label, "exited with code " + process.ExitCode);
            BeginInvoke((Action)(() =>
            {
                if (label == "server") serverStatus.Text = "Server: stopped";
                if (label == "client") clientStatus.Text = "Client: stopped";
                if ((serverProcess == null || serverProcess.HasExited) && (clientProcess == null || clientProcess.HasExited))
                {
                    UpdateButtons(false);
                }
            }));
        };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        File.WriteAllText(pidFile, process.Id.ToString());
        Append(label, "started PID " + process.Id);

        if (label == "server") serverStatus.Text = "Server: running";
        if (label == "client") clientStatus.Text = "Client: running";
        return process;
    }

    private void StopAll(string reason)
    {
        Append("launcher", "Stopping processes: " + reason);
        StopProcessTree(serverProcess, "server");
        StopProcessTree(clientProcess, "client");
        StopPreviousPid(serverPidFile, "server");
        StopPreviousPid(clientPidFile, "client");
        serverProcess = null;
        clientProcess = null;
        serverStatus.Text = "Server: stopped";
        clientStatus.Text = "Client: stopped";
        UpdateButtons(false);
    }

    private void StopPreviousPid(string pidFile, string label)
    {
        if (!File.Exists(pidFile)) return;
        int pid;
        if (int.TryParse(File.ReadAllText(pidFile).Trim(), out pid))
        {
            StopProcessTree(pid, label);
        }
        try { File.Delete(pidFile); } catch { }
    }

    private void StopProcessTree(Process process, string label)
    {
        if (process == null || process.HasExited) return;
        StopProcessTree(process.Id, label);
    }

    private void StopProcessTree(int pid, string label)
    {
        if (pid <= 0 || pid == Process.GetCurrentProcess().Id) return;
        foreach (var childPid in GetChildProcessIds(pid))
        {
            StopProcessTree(childPid, label);
        }
        try
        {
            var process = Process.GetProcessById(pid);
            Append(label, "stopping PID " + pid);
            process.Kill();
            process.WaitForExit(2000);
        }
        catch { }
    }

    private static IEnumerable<int> GetChildProcessIds(int parentPid)
    {
        var query = "SELECT ProcessId FROM Win32_Process WHERE ParentProcessId = " + parentPid;
        using (var searcher = new ManagementObjectSearcher(query))
        {
            foreach (ManagementObject item in searcher.Get())
            {
                yield return Convert.ToInt32(item["ProcessId"]);
            }
        }
    }

    private void OpenClient()
    {
        var mode = (string)clientMode.SelectedItem;
        var url = mode == "dev" ? "http://localhost:5173" : "http://localhost:4173";
        try
        {
            Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
        }
        catch (Exception ex)
        {
            Append("launcher", "open failed: " + ex.Message);
        }
    }

    private void UpdateButtons(bool running)
    {
        startButton.Enabled = !running;
        stopButton.Enabled = running;
        restartButton.Enabled = true;
        openButton.Enabled = true;
    }

    private void Append(string source, string message)
    {
        if (IsDisposed) return;
        if (InvokeRequired)
        {
            BeginInvoke((Action)(() => Append(source, message)));
            return;
        }
        var timestamp = DateTime.Now.ToString("HH:mm:ss");
        logBox.AppendText("[" + timestamp + "] [" + source + "] " + message + Environment.NewLine);
        logBox.SelectionStart = logBox.TextLength;
        logBox.ScrollToCaret();
    }

    private void OnFormClosing(object sender, FormClosingEventArgs e)
    {
        if ((serverProcess != null && !serverProcess.HasExited) || (clientProcess != null && !clientProcess.HasExited))
        {
            var result = MessageBox.Show("Stop server and client before closing?", "Start Vxpers", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
            if (result == DialogResult.Cancel)
            {
                e.Cancel = true;
                return;
            }
            if (result == DialogResult.Yes)
            {
                StopAll("app closing");
            }
        }
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }
}
