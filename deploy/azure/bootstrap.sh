#!/usr/bin/env bash
# One-time setup for the Azure VM that runs the WKSL stack.
# Walk through it from deploy/azure/README.md — this is the script that
# README.md step 3 tells you to run.
#
# What this does:
#   1. installs Docker Engine + the compose plugin (the stack is two containers)
#   2. installs cloudflared (the EXISTING tunnel — outbound only, no open ports)
#   3. adds a 4G swapfile (B1s has 1 GB of RAM; prisma migrate + docker pull
#      need headroom on top of postgres + node + cloudflared)
#   4. installs (but does not start) the cloudflared systemd unit — the tunnel
#      config and credentials only arrive later, in README.md step 6
#   5. enables ufw allowing SSH only; the Azure NSG is the real gatekeeper
#
# No inbound ports are opened for the app: the tunnel is outbound-only.

set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "run as your normal user (e.g. azureuser), not root" >&2
  exit 1
fi

ARCH="$(dpkg --print-architecture)"
export DEBIAN_FRONTEND=noninteractive

echo "▸ installing docker"
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y \
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"

echo "▸ installing cloudflared"
# Official .deb from GitHub releases — works for both amd64 and arm64 VMs.
curl -fsSL -o /tmp/cloudflared.deb \
  "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
sudo dpkg -i /tmp/cloudflared.deb
rm -f /tmp/cloudflared.deb

echo "▸ adding swap (4G)"
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
fi

echo "▸ installing the cloudflared systemd unit (enabled, not started yet)"
CLOUDFLARED_BIN="$(command -v cloudflared)"
sudo tee /etc/systemd/system/cloudflared.service > /dev/null <<UNIT
[Unit]
Description=Cloudflare Tunnel for the WKSL app
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${CLOUDFLARED_BIN} --config /etc/cloudflared/config.yml tunnel run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable cloudflared > /dev/null 2>&1

echo "▸ firewall: allow SSH only"
sudo ufw allow OpenSSH
sudo ufw --force enable

echo "▸ docker group"
id -nG | grep -qw docker || echo "  (group added — log out and back in for it to apply)"

echo
echo "✓ done — continue with deploy/azure/README.md step 4"
