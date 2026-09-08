using System;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using Wpf.Ui.Controls;

namespace StartVxpersWpf
{
    /// <summary>
    /// Code-behind: owns the same direct node/npm process management as the WinForms launcher
    /// (via the shared ProcessRunner class) — no PowerShell scripts involved. The XAML above is
    /// yours to redesign; just keep wiring these same event handlers / x:Name references.
    /// </summary>
    public partial class MainWindow : FluentWindow
    {
        private const int ServerPort = 3001;
        private const int ClientDevPort = 5173;
        private const int ClientPreviewPort = 4173;
        private const int AdminplusPort = 3010;

        private static readonly SolidColorBrush OnlineDot = new SolidColorBrush(Color.FromRgb(0x22, 0xC5, 0x5E));
        private static readonly SolidColorBrush OfflineDot = new SolidColorBrush(Color.FromRgb(0xCB, 0xD5, 0xE1));

        private readonly ProcessRunner _server = new ProcessRunner("SERVER");
        private readonly ProcessRunner _client = new ProcessRunner("CLIENT");
        private readonly ProcessRunner _adminplus = new ProcessRunner("ADMIN+");
        private readonly DispatcherTimer _statusTimer;
        private bool _busy;
        private bool _devMode = true;

        public MainWindow()
        {
            InitializeComponent();
            SetMode(devMode: true);

            _server.OutputLine += line => AppendLogAsync("SERVER", line);
            _server.ErrorLine += line => AppendLogAsync("SERVER", line);
            _server.Exited += code => AppendLogAsync("SERVER", $"process exited (code {code})");

            _client.OutputLine += line => AppendLogAsync("CLIENT", line);
            _client.ErrorLine += line => AppendLogAsync("CLIENT", line);
            _client.Exited += code => AppendLogAsync("CLIENT", $"process exited (code {code})");

            _adminplus.OutputLine += line => AppendLogAsync("ADMIN+", line);
            _adminplus.ErrorLine += line => AppendLogAsync("ADMIN+", line);
            _adminplus.Exited += code => AppendLogAsync("ADMIN+", $"process exited (code {code})");

            AppendLog("SYSTEM", "VxperS Control Center (WPF) ready.");
            AppendLog("SYSTEM", "Root: " + ToolPaths.RepoRoot);
            if (!ToolPaths.NodeAvailable)
                AppendLog("SYSTEM", "WARNING: node.exe was not found on PATH.");

            _statusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            _statusTimer.Tick += (s, e) => RefreshStatus();
            _statusTimer.Start();
            RefreshStatus();

            Closing += (s, e) => StopAll("window closing");
        }

        private void OnStartClick(object sender, RoutedEventArgs e) => StartAll();
        private void OnStopClick(object sender, RoutedEventArgs e) => StopAll("stop requested");
        private void OnRestartClick(object sender, RoutedEventArgs e) { StopAll("restarting"); StartAll(); }
        private void OnOpenBrowserClick(object sender, RoutedEventArgs e) => OpenBrowser();
        private void OnOpenAdminplusClick(object sender, RoutedEventArgs e) => OpenAdminplus();
        private void OnClearLogClick(object sender, RoutedEventArgs e) => LogBox.Clear();
        private void OnDevModeClick(object sender, RoutedEventArgs e) => SetMode(devMode: true);
        private void OnPreviewModeClick(object sender, RoutedEventArgs e) => SetMode(devMode: false);

        private void SetMode(bool devMode)
        {
            _devMode = devMode;
            // WPF-UI renders ControlAppearance.Secondary as the filled/accent look and Primary as
            // the flat one for this control — verified visually, so the mapping below is
            // intentionally the "wrong-looking" way round to match what actually renders.
            DevModeButton.Appearance = devMode ? ControlAppearance.Secondary : ControlAppearance.Primary;
            PreviewModeButton.Appearance = devMode ? ControlAppearance.Primary : ControlAppearance.Secondary;
        }

        private void StartAll()
        {
            if (_busy) return;
            if (!ToolPaths.NodeAvailable)
            {
                AppendLog("SYSTEM", "Cannot start: node.exe not found on PATH.");
                return;
            }

            StopAll("starting fresh session");
            SetBusy(true);

            var devMode = _devMode;
            var installDeps = InstallDepsCheck.IsChecked == true;
            var rebuildClient = BuildCheck.IsChecked == true;
            // Admin+ is part of the stack, not an option — the store can't be administered without it.
            var startAdminplus = ToolPaths.AdminplusPresent;

            Task.Run(() =>
            {
                try
                {
                    if (installDeps)
                    {
                        RunInstall("SERVER", ToolPaths.ServerDir);
                        RunInstall("CLIENT", ToolPaths.ClientDir);
                        if (startAdminplus) RunInstall("ADMIN+", ToolPaths.AdminplusDir);
                    }

                    if (!ToolPaths.ServerDepsInstalled)
                    {
                        AppendLogAsync("SYSTEM", "server/node_modules missing — check 'Install dependencies' and try again.");
                        return;
                    }
                    if (!ToolPaths.ClientDepsInstalled)
                    {
                        AppendLogAsync("SYSTEM", "client/node_modules missing — check 'Install dependencies' and try again.");
                        return;
                    }

                    Dispatcher.Invoke(() =>
                    {
                        _server.Start(ToolPaths.NodeExe, "index.js", ToolPaths.ServerDir);
                        AppendLog("SYSTEM", $"Backend API server launching on http://localhost:{ServerPort}");
                    });

                    if (!devMode && (rebuildClient || !ToolPaths.ClientBuilt))
                    {
                        AppendLogAsync("SYSTEM", "Building client (vite build)...");
                        var code = new ProcessRunner("BUILD").RunToCompletion(ToolPaths.NodeExe, $"\"{ToolPaths.ViteCli}\" build", ToolPaths.ClientDir);
                        if (code != 0)
                        {
                            AppendLogAsync("SYSTEM", $"Client build failed (exit {code}) — aborting client start.");
                            return;
                        }
                        AppendLogAsync("SYSTEM", "Client build complete.");
                    }

                    Dispatcher.Invoke(() =>
                    {
                        if (devMode)
                        {
                            _client.Start(ToolPaths.NodeExe, $"\"{ToolPaths.ViteCli}\" --host 0.0.0.0 --port {ClientDevPort}", ToolPaths.ClientDir);
                            AppendLog("SYSTEM", $"Web client (dev) launching on http://localhost:{ClientDevPort}");
                        }
                        else
                        {
                            _client.Start(ToolPaths.NodeExe, $"\"{ToolPaths.ViteCli}\" preview --host 0.0.0.0 --port {ClientPreviewPort}", ToolPaths.ClientDir);
                            AppendLog("SYSTEM", $"Web client (preview) launching on http://localhost:{ClientPreviewPort}");
                        }
                    });

                    if (startAdminplus) StartAdminplus(devMode, rebuildClient);

                    WaitThenAutoOpen(devMode ? ClientDevPort : ClientPreviewPort);
                }
                finally
                {
                    Dispatcher.Invoke(() => SetBusy(false));
                }
            });
        }

        /// <summary>
        /// Starts the Admin+ Next.js panel: `next dev` in dev mode, or `next build` (when needed)
        /// followed by `next start` in preview mode. Never aborts the rest of the session — if
        /// adminplus can't start, the store client is still up.
        /// </summary>
        private void StartAdminplus(bool devMode, bool forceRebuild)
        {
            if (!ToolPaths.AdminplusDepsInstalled)
            {
                AppendLogAsync("ADMIN+", "adminplus/node_modules missing — check 'Install dependencies' and try again.");
                return;
            }

            if (!devMode && (forceRebuild || !ToolPaths.AdminplusBuilt))
            {
                AppendLogAsync("SYSTEM", "Building Admin+ (next build)...");
                var code = new ProcessRunner("ADMIN+BUILD").RunToCompletion(ToolPaths.NodeExe, $"\"{ToolPaths.NextCli}\" build", ToolPaths.AdminplusDir);
                if (code != 0)
                {
                    AppendLogAsync("SYSTEM", $"Admin+ build failed (exit {code}) — skipping Admin+ start.");
                    return;
                }
                AppendLogAsync("SYSTEM", "Admin+ build complete.");
            }

            Dispatcher.Invoke(() =>
            {
                var command = devMode ? "dev" : "start";
                _adminplus.Start(ToolPaths.NodeExe, $"\"{ToolPaths.NextCli}\" {command} -H 0.0.0.0 -p {AdminplusPort}", ToolPaths.AdminplusDir);
                AppendLog("SYSTEM", $"Admin+ panel ({command}) launching on http://localhost:{AdminplusPort}");
            });
        }

        private void RunInstall(string tag, string dir)
        {
            AppendLogAsync(tag, "npm install...");
            var runner = new ProcessRunner(tag);
            runner.OutputLine += line => AppendLogAsync(tag, line);
            runner.ErrorLine += line => AppendLogAsync(tag, line);
            var code = runner.RunToCompletion(ToolPaths.NpmCmd, "install", dir);
            AppendLogAsync(tag, code == 0 ? "npm install finished." : $"npm install failed (exit {code}).");
        }

        private void WaitThenAutoOpen(int clientPort)
        {
            for (var i = 0; i < 40; i++)
            {
                System.Threading.Thread.Sleep(500);
                if (PortCheck.IsListening(ServerPort) && PortCheck.IsListening(clientPort))
                {
                    AppendLogAsync("READY", "All services are online. Opening browser...");
                    Dispatcher.Invoke(() => OpenUrl($"http://localhost:{clientPort}"));
                    return;
                }
            }
            AppendLogAsync("READY", "Services are still starting in the background — check the log above for errors.");
        }

        private void StopAll(string reason)
        {
            AppendLog("SYSTEM", $"Stopping services ({reason})...");
            _server.Stop();
            _client.Stop();
            _adminplus.Stop();
        }

        private void SetBusy(bool busy)
        {
            _busy = busy;
            StartButton.IsEnabled = !busy;
            RestartButton.IsEnabled = !busy;
            InstallDepsCheck.IsEnabled = !busy;
            BuildCheck.IsEnabled = !busy;
            DevModeButton.IsEnabled = !busy;
            PreviewModeButton.IsEnabled = !busy;
            StatusText.Text = busy ? "Working..." : "Idle";
        }

        private void OpenBrowser()
        {
            var port = PortCheck.IsListening(ClientPreviewPort) ? ClientPreviewPort
                : PortCheck.IsListening(ClientDevPort) ? ClientDevPort
                : -1;
            if (port < 0)
            {
                AppendLog("SYSTEM", "Client isn't running yet — click Start All first.");
                return;
            }
            OpenUrl($"http://localhost:{port}");
        }

        private void OpenAdminplus()
        {
            if (!PortCheck.IsListening(AdminplusPort))
            {
                AppendLog("SYSTEM", "Admin+ isn't running yet — click Start All first.");
                return;
            }
            OpenUrl($"http://localhost:{AdminplusPort}");
        }

        private void OpenUrl(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
                AppendLog("SYSTEM", "Opened " + url);
            }
            catch (Exception ex)
            {
                AppendLog("SYSTEM", "Could not open browser: " + ex.Message);
            }
        }

        private void RefreshStatus()
        {
            var serverOn = PortCheck.IsListening(ServerPort);
            ServerDot.Fill = serverOn ? OnlineDot : OfflineDot;
            ServerCaption.Text = serverOn ? $"Online — :{ServerPort}" : "Offline";

            var devOn = PortCheck.IsListening(ClientDevPort);
            var previewOn = PortCheck.IsListening(ClientPreviewPort);
            var clientOn = devOn || previewOn;
            ClientDot.Fill = clientOn ? OnlineDot : OfflineDot;
            ClientCaption.Text = devOn ? $"Online (dev) — :{ClientDevPort}" : previewOn ? $"Online (preview) — :{ClientPreviewPort}" : "Offline";

            var adminplusOn = PortCheck.IsListening(AdminplusPort);
            AdminplusDot.Fill = adminplusOn ? OnlineDot : OfflineDot;
            AdminplusCaption.Text = adminplusOn ? $"Online — :{AdminplusPort}"
                : ToolPaths.AdminplusPresent ? "Offline"
                : "Not installed";

            if (!_busy) StatusText.Text = "Idle";
        }

        private void AppendLogAsync(string tag, string message)
        {
            Dispatcher.BeginInvoke(new Action(() => AppendLog(tag, message)));
        }

        private void AppendLog(string tag, string message)
        {
            LogBox.AppendText($"[{DateTime.Now:HH:mm:ss}] [{tag}] {message}\n");
            LogBox.ScrollToEnd();
        }
    }
}
