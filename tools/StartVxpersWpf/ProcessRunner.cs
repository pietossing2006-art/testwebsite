using System;
using System.Diagnostics;
using System.IO;
using System.Net.NetworkInformation;
using System.Text;

namespace StartVxpersWpf
{
    /// <summary>
    /// Runs one child process (node / npm) directly via CreateProcess, with its stdout/stderr
    /// streamed back line-by-line. No PowerShell, no .ps1/.bat wrapper scripts — this app owns
    /// the process lifecycle end to end. (Same logic as the WinForms launcher's ProcessRunner —
    /// this class has no UI dependency, so it's shared as-is.)
    /// </summary>
    internal sealed class ProcessRunner : IDisposable
    {
        public event Action<string> OutputLine;
        public event Action<string> ErrorLine;
        public event Action<int> Exited;

        public string Tag { get; }

        public bool IsRunning => _process != null && !HasExitedSafe();

        private Process _process;

        public ProcessRunner(string tag)
        {
            Tag = tag;
        }

        public void Start(string fileName, string arguments, string workingDirectory)
        {
            if (IsRunning) return;

            var psi = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                WorkingDirectory = workingDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };

            _process = new Process { StartInfo = psi, EnableRaisingEvents = true };
            _process.OutputDataReceived += HandleOutputData;
            _process.ErrorDataReceived += HandleErrorData;
            _process.Exited += HandleExited;

            _process.Start();
            _process.BeginOutputReadLine();
            _process.BeginErrorReadLine();
        }

        private void HandleOutputData(object sender, DataReceivedEventArgs e)
        {
            if (e.Data == null) return;
            OutputLine?.Invoke(e.Data);
        }

        private void HandleErrorData(object sender, DataReceivedEventArgs e)
        {
            if (e.Data == null) return;
            ErrorLine?.Invoke(e.Data);
        }

        private void HandleExited(object sender, EventArgs e)
        {
            Exited?.Invoke(SafeExitCode());
        }

        /// <summary>Runs a process to completion synchronously (blocks the calling thread) and returns its exit code.</summary>
        public int RunToCompletion(string fileName, string arguments, string workingDirectory)
        {
            var psi = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                WorkingDirectory = workingDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };

            using var p = new Process { StartInfo = psi };
            p.OutputDataReceived += HandleOutputData;
            p.ErrorDataReceived += HandleErrorData;
            p.Start();
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            p.WaitForExit();
            return p.ExitCode;
        }

        public void Stop()
        {
            if (_process == null) return;
            try
            {
                if (!_process.HasExited)
                {
                    // Kill the whole tree (node/vite often spawn child workers) via taskkill —
                    // avoids taking a System.Management/WMI dependency just for that.
                    RunFireAndForget("taskkill.exe", "/PID " + _process.Id + " /T /F");
                }
            }
            catch
            {
                // process may have already exited
            }
        }

        private static void RunFireAndForget(string fileName, string arguments)
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                };
                using var p = Process.Start(psi);
                p?.WaitForExit(3000);
            }
            catch
            {
                // best effort
            }
        }

        private bool HasExitedSafe()
        {
            try { return _process.HasExited; } catch { return true; }
        }

        private int SafeExitCode()
        {
            try { return _process.ExitCode; } catch { return -1; }
        }

        public void Dispose() => _process?.Dispose();
    }

    /// <summary>Locates the Node.js toolchain and this repo's server/client/adminplus directories on disk.</summary>
    internal static class ToolPaths
    {
        public static readonly string RepoRoot;
        public static readonly string ServerDir;
        public static readonly string ClientDir;
        public static readonly string AdminplusDir;
        public static readonly string NodeExe;
        public static readonly string NpmCmd;

        static ToolPaths()
        {
            RepoRoot = LocateRepoRoot();
            ServerDir = Path.Combine(RepoRoot, "server");
            ClientDir = Path.Combine(RepoRoot, "client");
            AdminplusDir = Path.Combine(RepoRoot, "adminplus");
            NodeExe = FindOnPath("node.exe") ?? "node.exe";
            NpmCmd = FindOnPath("npm.cmd") ?? "npm.cmd";
        }

        private static string LocateRepoRoot()
        {
            var dir = AppDomain.CurrentDomain.BaseDirectory;
            for (var i = 0; i < 6 && dir != null; i++)
            {
                if (Directory.Exists(Path.Combine(dir, "server")) && Directory.Exists(Path.Combine(dir, "client")))
                {
                    return dir.TrimEnd(Path.DirectorySeparatorChar);
                }
                dir = Directory.GetParent(dir)?.FullName;
            }
            return AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        }

        private static string FindOnPath(string exeName)
        {
            var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (var dir in pathEnv.Split(';'))
            {
                if (string.IsNullOrWhiteSpace(dir)) continue;
                try
                {
                    var candidate = Path.Combine(dir.Trim(), exeName);
                    if (File.Exists(candidate)) return candidate;
                }
                catch
                {
                    // malformed PATH entry
                }
            }
            return null;
        }

        public static bool NodeAvailable => File.Exists(NodeExe);
        public static bool NpmAvailable => File.Exists(NpmCmd);
        public static bool ServerDepsInstalled => Directory.Exists(Path.Combine(ServerDir, "node_modules"));
        public static bool ClientDepsInstalled => Directory.Exists(Path.Combine(ClientDir, "node_modules"));
        public static string ViteCli => Path.Combine(ClientDir, "node_modules", "vite", "bin", "vite.js");
        public static bool ClientBuilt => File.Exists(Path.Combine(ClientDir, "dist", "index.html"));

        // ── Admin+ (adminplus/) — the Next.js admin panel that replaces the old AdminV3 screens ──
        public static bool AdminplusPresent => Directory.Exists(AdminplusDir);
        public static bool AdminplusDepsInstalled => Directory.Exists(Path.Combine(AdminplusDir, "node_modules"));
        public static string NextCli => Path.Combine(AdminplusDir, "node_modules", "next", "dist", "bin", "next");
        /// <summary>next build writes BUILD_ID last, so its presence means a usable production build exists.</summary>
        public static bool AdminplusBuilt => File.Exists(Path.Combine(AdminplusDir, ".next", "BUILD_ID"));
    }

    internal static class PortCheck
    {
        public static bool IsListening(int port)
        {
            try
            {
                var listeners = IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners();
                foreach (var ep in listeners)
                {
                    if (ep.Port == port) return true;
                }
            }
            catch
            {
                // ignore transient network-stack errors
            }
            return false;
        }
    }
}
