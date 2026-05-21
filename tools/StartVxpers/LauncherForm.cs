using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Text;
using System.Windows.Forms;

public sealed partial class LauncherForm : Form
{
    private readonly string root;
    private readonly string stateDir;
    private readonly string serverPidFile;
    private readonly string clientPidFile;

    private Process serverProcess;
    private Process clientProcess;

    public LauncherForm()
    {
        InitializeComponent();

        root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        stateDir = Path.Combine(root, ".script-state");
        serverPidFile = Path.Combine(stateDir, "server.pid");
        clientPidFile = Path.Combine(stateDir, "client.pid");

        serverMode.SelectedItem = "dev";
        clientMode.SelectedItem = "preview";
        buildClient.Checked = true;

        startButton.Click += (s, e) => StartAll();
        stopButton.Click += (s, e) => StopAll("manual stop");
        restartButton.Click += (s, e) => { StopAll("restart"); StartAll(); };
        openButton.Click += (s, e) => OpenClient();
        clearButton.Click += (s, e) => logBox.Clear();
        FormClosing += OnFormClosing;

        UpdateButtons(false);
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
