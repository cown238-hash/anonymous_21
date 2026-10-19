# One-time setup for an Oracle Cloud Always Free (Ampere A1 / ARM64) instance.
#
#   curl -fsSL <raw-url>/deploy/oracle/bootstrap.sh | bash    # or: bash deploy/oracle/bootstrap.sh
#   # then log out and back in so the docker group applies
#
# What this does:
#   1. installs Docker Engine + the compose plugin
#   2. installs Node 22 (for admin scripts that need direct DB access)
#   3. adds a swapfile (docker builds on ARM are memory-hungry)
#   4. opens 80/443 on the VM's own firewall
#
# Oracle blocks ports in TWO places — this script opens the instance side;
# you must also add an Ingress Rule for 80/443 in the VCN Security List
# (see README.md).

set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "run as your normal user (e.g. ubuntu), not root" >&2
  exit 1
fi

ARCH="$(dpkg --print-architecture)"
if [ "$ARCH" != "arm64" ]; then
  echo "! this host is $ARCH — the script assumes ARM64 (Ampere A1)" >&2
fi

echo "▸ installing docker"
export DEBIAN_FRONTEND=noninteractive
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

echo "▸ installing node 22 (create-admin / set-password scripts)"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "▸ adding swap (4G)"
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
fi

echo "▸ opening 80/443 on the instance firewall"
# OCI Ubuntu images ship with an iptables ruleset that only accepts SSH.
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent

# Default: 80/443 open to the world, because the VM must answer Cloudflare's
# Let's Encrypt challenge before the domain is proxied. Once wksl.site is
# proxied through Cloudflare (orange cloud), re-run with:
#
#   LOCK_TO_CLOUDFLARE=true bash deploy/oracle/bootstrap.sh
#
# so the origin only accepts those ports from Cloudflare's ranges — nobody can
# then reach the server by IP and skip the WAF. Cloudflare's ranges change
# rarely; re-run the same command after any Cloudflare IP announcement.
if [ "${LOCK_TO_CLOUDFLARE:-false}" = "true" ]; then
  for LIST in https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6; do
    for CIDR in $(curl -fsSL "$LIST"); do
      for PORT in 80 443; do
        sudo iptables -C INPUT -p tcp --dport "$PORT" -s "$CIDR" -j ACCEPT 2>/dev/null \
          || sudo iptables -I INPUT 6 -p tcp --dport "$PORT" -s "$CIDR" -j ACCEPT
      done
    done
  done
  echo "  80/443 locked to Cloudflare IP ranges"
else
  for PORT in 80 443; do
    if ! sudo iptables -C INPUT -m state --state NEW -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null; then
      # Position 6 lands the rule before the catch-all REJECT, after SSH.
      sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$PORT" -j ACCEPT
    fi
  done
fi
sudo netfilter-persistent save

echo
echo "✓ done — log out and back in, then continue with README.md step 3"
