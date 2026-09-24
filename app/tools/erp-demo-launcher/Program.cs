using System.Diagnostics;
using System.Drawing;
using System.Text;
using System.Windows.Forms;

namespace Ontos.ErpDemoLauncher;

internal static class Program
{
    private const string MutexName = @"Local\OntosErpDemoLauncher";

    [STAThread]
    private static void Main(string[] args)
    {
        using var mutex = new Mutex(true, MutexName, out var ownsMutex);
        if (!ownsMutex)
        {
            MessageBox.Show(
                "Spouštění ERP dema už probíhá.",
                "SOS vyklízení",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new LauncherForm(args.Contains("--no-browser", StringComparer.OrdinalIgnoreCase)));
    }
}

internal sealed class LauncherForm : Form
{
    private readonly Label _status = new();
    private readonly ProgressBar _progress = new();
    private readonly bool _noBrowser;

    internal LauncherForm(bool noBrowser)
    {
        _noBrowser = noBrowser;
        Text = "SOS vyklízení — spuštění ERP dema";
        ClientSize = new Size(460, 150);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;

        var heading = new Label
        {
            AutoSize = true,
            Font = new Font("Segoe UI", 14, FontStyle.Bold),
            Location = new Point(24, 20),
            Text = "Spouštím ERP demo"
        };

        _status.AutoSize = false;
        _status.Location = new Point(26, 60);
        _status.Size = new Size(408, 32);
        _status.Text = "Připravuji Docker a aplikační moduly…";

        _progress.Location = new Point(26, 104);
        _progress.Size = new Size(408, 18);
        _progress.Style = ProgressBarStyle.Marquee;
        _progress.MarqueeAnimationSpeed = 30;

        Controls.Add(heading);
        Controls.Add(_status);
        Controls.Add(_progress);
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        await StartDemoAsync();
    }

    private async Task StartDemoAsync()
    {
        var repositoryRoot = AppContext.BaseDirectory;
        var scriptPath = Path.Combine(repositoryRoot, "app", "scripts", "start-erp-demo.ps1");
        if (!File.Exists(scriptPath))
        {
            Fail($"Spouštěcí skript nebyl nalezen:\n{scriptPath}\n\nPonechte EXE v kořeni složky ontos-inquiries.");
            return;
        }

        var windowsDirectory = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        var powerShellPath = Path.Combine(
            windowsDirectory,
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe");
        var arguments = new StringBuilder()
            .Append("-NoProfile -ExecutionPolicy Bypass -File ")
            .Append('"').Append(scriptPath).Append('"');
        if (_noBrowser)
        {
            arguments.Append(" -NoBrowser");
        }

        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = powerShellPath,
                Arguments = arguments.ToString(),
                WorkingDirectory = Path.Combine(repositoryRoot, "app"),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            }
        };

        try
        {
            process.Start();
            var outputTask = process.StandardOutput.ReadToEndAsync();
            var errorTask = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();
            var output = await outputTask;
            var error = await errorTask;

            if (process.ExitCode != 0)
            {
                var detail = string.IsNullOrWhiteSpace(error) ? output : error;
                Fail($"ERP demo se nepodařilo spustit.\n\n{Tail(detail, 1400)}");
                return;
            }

            _progress.Style = ProgressBarStyle.Continuous;
            _progress.Value = 100;
            _status.Text = "ERP demo běží. Otevírám prohlížeč…";
            await Task.Delay(1200);
            Close();
        }
        catch (Exception exception)
        {
            Fail($"ERP demo se nepodařilo spustit.\n\n{exception.Message}");
        }
    }

    private void Fail(string message)
    {
        Environment.ExitCode = 1;
        MessageBox.Show(message, "SOS vyklízení", MessageBoxButtons.OK, MessageBoxIcon.Error);
        Close();
    }

    private static string Tail(string value, int maximumLength) =>
        value.Length <= maximumLength ? value : value[^maximumLength..];
}
