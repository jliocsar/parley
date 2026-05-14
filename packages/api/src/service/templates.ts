import { ENV_FILE, LAUNCHD_ERR_LOG, LAUNCHD_LABEL, LAUNCHD_OUT_LOG, SERVICE_LABEL } from './paths'

export const renderSystemdUnit = (binaryPath: string) =>
  `[Unit]
Description=Parley server (Claude-to-Claude chat)
After=network.target

[Service]
Type=simple
ExecStart=${binaryPath} run
EnvironmentFile=-${ENV_FILE}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
`

export const renderLaunchdPlist = (binaryPath: string) => {
  const script = [
    'set -a',
    `[ -f '${ENV_FILE}' ] && . '${ENV_FILE}'`,
    `exec '${binaryPath}' run`,
  ].join('; ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>${script}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>2</integer>
  <key>StandardOutPath</key>
  <string>${LAUNCHD_OUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LAUNCHD_ERR_LOG}</string>
</dict>
</plist>
`
}

export const renderEnvFile = (vars: Record<string, string | undefined>) => {
  const lines = [
    `# Parley server environment — edit and run \`${SERVICE_LABEL} service restart\``,
    `# Variables not set here fall back to the server's compiled-in defaults.`,
    '',
  ]

  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined || v === '') {
      lines.push(`# ${k}=`)
    } else {
      lines.push(`${k}=${v}`)
    }
  }

  return `${lines.join('\n')}\n`
}
