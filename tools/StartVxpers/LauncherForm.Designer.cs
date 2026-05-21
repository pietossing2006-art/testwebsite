using System.Drawing;
using System.Windows.Forms;

partial class LauncherForm
{
    private System.ComponentModel.IContainer components = null;
    private ComboBox serverMode;
    private ComboBox clientMode;
    private CheckBox installDeps;
    private CheckBox buildClient;
    private Button startButton;
    private Button stopButton;
    private Button restartButton;
    private Button openButton;
    private Button clearButton;
    private Label serverStatus;
    private Label clientStatus;
    private RichTextBox logBox;
    private Label titleLabel;
    private Label subtitleLabel;
    private Label serverLabel;
    private Label clientLabel;
    private Panel controlPanel;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        this.components = new System.ComponentModel.Container();
        this.serverMode = new ComboBox();
        this.clientMode = new ComboBox();
        this.installDeps = new CheckBox();
        this.buildClient = new CheckBox();
        this.startButton = new Button();
        this.stopButton = new Button();
        this.restartButton = new Button();
        this.openButton = new Button();
        this.clearButton = new Button();
        this.serverStatus = new Label();
        this.clientStatus = new Label();
        this.logBox = new RichTextBox();
        this.titleLabel = new Label();
        this.subtitleLabel = new Label();
        this.serverLabel = new Label();
        this.clientLabel = new Label();
        this.controlPanel = new Panel();
        this.controlPanel.SuspendLayout();
        this.SuspendLayout();

        this.serverMode.DropDownStyle = ComboBoxStyle.DropDownList;
        this.serverMode.FlatStyle = FlatStyle.Flat;
        this.serverMode.Items.AddRange(new object[] { "dev", "start" });
        this.serverMode.Location = new Point(22, 48);
        this.serverMode.Name = "serverMode";
        this.serverMode.Size = new Size(126, 28);

        this.clientMode.DropDownStyle = ComboBoxStyle.DropDownList;
        this.clientMode.FlatStyle = FlatStyle.Flat;
        this.clientMode.Items.AddRange(new object[] { "preview", "dev" });
        this.clientMode.Location = new Point(178, 48);
        this.clientMode.Name = "clientMode";
        this.clientMode.Size = new Size(126, 28);

        this.installDeps.AutoSize = true;
        this.installDeps.ForeColor = Color.FromArgb(210, 224, 244);
        this.installDeps.Location = new Point(350, 50);
        this.installDeps.Name = "installDeps";
        this.installDeps.Size = new Size(134, 24);
        this.installDeps.Text = "Install deps first";
        this.installDeps.UseVisualStyleBackColor = true;

        this.buildClient.AutoSize = true;
        this.buildClient.ForeColor = Color.FromArgb(210, 224, 244);
        this.buildClient.Location = new Point(500, 50);
        this.buildClient.Name = "buildClient";
        this.buildClient.Size = new Size(105, 24);
        this.buildClient.Text = "Build client";
        this.buildClient.UseVisualStyleBackColor = true;

        ConfigureButton(this.startButton, "Start", Color.FromArgb(14, 165, 233), new Point(635, 38));
        ConfigureButton(this.stopButton, "Stop", Color.FromArgb(239, 68, 68), new Point(735, 38));
        ConfigureButton(this.restartButton, "Restart", Color.FromArgb(99, 102, 241), new Point(835, 38));
        ConfigureButton(this.openButton, "Open", Color.FromArgb(34, 197, 94), new Point(935, 38));

        this.clearButton.BackColor = Color.FromArgb(15, 23, 42);
        this.clearButton.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
        this.clearButton.FlatStyle = FlatStyle.Flat;
        this.clearButton.ForeColor = Color.FromArgb(210, 224, 244);
        this.clearButton.Location = new Point(915, 272);
        this.clearButton.Name = "clearButton";
        this.clearButton.Size = new Size(120, 34);
        this.clearButton.Text = "Clear log";
        this.clearButton.UseVisualStyleBackColor = false;

        this.serverStatus.AutoSize = true;
        this.serverStatus.ForeColor = Color.FromArgb(148, 163, 184);
        this.serverStatus.Location = new Point(22, 100);
        this.serverStatus.Name = "serverStatus";
        this.serverStatus.Text = "Server: stopped";

        this.clientStatus.AutoSize = true;
        this.clientStatus.ForeColor = Color.FromArgb(148, 163, 184);
        this.clientStatus.Location = new Point(178, 100);
        this.clientStatus.Name = "clientStatus";
        this.clientStatus.Text = "Client: stopped";

        this.logBox.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        this.logBox.BackColor = Color.FromArgb(3, 7, 18);
        this.logBox.BorderStyle = BorderStyle.None;
        this.logBox.Font = new Font("Cascadia Mono", 9F);
        this.logBox.ForeColor = Color.FromArgb(226, 232, 240);
        this.logBox.Location = new Point(28, 316);
        this.logBox.Name = "logBox";
        this.logBox.ReadOnly = true;
        this.logBox.Size = new Size(1010, 335);

        this.titleLabel.AutoSize = true;
        this.titleLabel.Font = new Font("Segoe UI Semibold", 24F);
        this.titleLabel.ForeColor = Color.FromArgb(225, 245, 255);
        this.titleLabel.Location = new Point(28, 22);
        this.titleLabel.Name = "titleLabel";
        this.titleLabel.Text = "Vxpers Local Launcher";

        this.subtitleLabel.AutoSize = true;
        this.subtitleLabel.ForeColor = Color.FromArgb(145, 164, 190);
        this.subtitleLabel.Location = new Point(32, 72);
        this.subtitleLabel.Name = "subtitleLabel";
        this.subtitleLabel.Text = "Start server and client silently in the background. Logs stay here.";

        this.serverLabel.AutoSize = true;
        this.serverLabel.ForeColor = Color.FromArgb(148, 163, 184);
        this.serverLabel.Location = new Point(22, 24);
        this.serverLabel.Name = "serverLabel";
        this.serverLabel.Text = "Server";

        this.clientLabel.AutoSize = true;
        this.clientLabel.ForeColor = Color.FromArgb(148, 163, 184);
        this.clientLabel.Location = new Point(178, 24);
        this.clientLabel.Name = "clientLabel";
        this.clientLabel.Text = "Client";

        this.controlPanel.BackColor = Color.FromArgb(20, 28, 48);
        this.controlPanel.Controls.Add(this.serverLabel);
        this.controlPanel.Controls.Add(this.serverMode);
        this.controlPanel.Controls.Add(this.clientLabel);
        this.controlPanel.Controls.Add(this.clientMode);
        this.controlPanel.Controls.Add(this.installDeps);
        this.controlPanel.Controls.Add(this.buildClient);
        this.controlPanel.Controls.Add(this.startButton);
        this.controlPanel.Controls.Add(this.stopButton);
        this.controlPanel.Controls.Add(this.restartButton);
        this.controlPanel.Controls.Add(this.openButton);
        this.controlPanel.Controls.Add(this.serverStatus);
        this.controlPanel.Controls.Add(this.clientStatus);
        this.controlPanel.Location = new Point(28, 112);
        this.controlPanel.Name = "controlPanel";
        this.controlPanel.Size = new Size(1010, 140);

        this.AutoScaleDimensions = new SizeF(8F, 20F);
        this.AutoScaleMode = AutoScaleMode.Font;
        this.BackColor = Color.FromArgb(13, 18, 32);
        this.ClientSize = new Size(1062, 673);
        this.Controls.Add(this.titleLabel);
        this.Controls.Add(this.subtitleLabel);
        this.Controls.Add(this.controlPanel);
        this.Controls.Add(this.clearButton);
        this.Controls.Add(this.logBox);
        this.Font = new Font("Segoe UI", 10F);
        this.ForeColor = Color.White;
        this.MinimumSize = new Size(980, 650);
        this.Name = "LauncherForm";
        this.StartPosition = FormStartPosition.CenterScreen;
        this.Text = "Start Vxpers";
        this.controlPanel.ResumeLayout(false);
        this.controlPanel.PerformLayout();
        this.ResumeLayout(false);
        this.PerformLayout();
    }

    private static void ConfigureButton(Button button, string text, Color color, Point location)
    {
        button.BackColor = color;
        button.FlatAppearance.BorderSize = 0;
        button.FlatStyle = FlatStyle.Flat;
        button.ForeColor = Color.White;
        button.Location = location;
        button.Name = text.ToLowerInvariant() + "Button";
        button.Size = new Size(86, 44);
        button.Text = text;
        button.UseVisualStyleBackColor = false;
    }
}
