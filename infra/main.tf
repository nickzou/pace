provider "hcloud" {}

data "hcloud_ssh_key" "main" {
  name = var.ssh_key_name
}

# Cloudflare's published edge IP ranges — fetched at apply time so the firewall
# stays in sync if Cloudflare changes them (no API token needed).
data "http" "cloudflare_ips_v4" {
  url = "https://www.cloudflare.com/ips-v4"
}

data "http" "cloudflare_ips_v6" {
  url = "https://www.cloudflare.com/ips-v6"
}

locals {
  cloudflare_ips = concat(
    split("\n", trimspace(data.http.cloudflare_ips_v4.response_body)),
    split("\n", trimspace(data.http.cloudflare_ips_v6.response_body)),
  )
}

resource "hcloud_firewall" "web" {
  name = "pace-web"
  # SSH — left open (key-only auth). CI deploys from GitHub runners' dynamic IPs,
  # so this can't be pinned to a single address.
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS — only from Cloudflare, so the origin is reachable solely via the CDN.
  # Port 80 is intentionally dropped: with Full (strict), Cloudflare connects to
  # the origin on 443 only.
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = local.cloudflare_ips
  }
}

resource "hcloud_server" "web" {
  name         = "pace-web"
  server_type  = var.server_type
  image        = var.image
  location     = var.location
  ssh_keys     = [data.hcloud_ssh_key.main.name]
  firewall_ids = [hcloud_firewall.web.id]
  labels       = { project = "pace" }
  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    ssh_public_keys = [
      data.hcloud_ssh_key.main.public_key,
      trimspace(file("${path.module}/public_keys/deploy_key.pub")),
    ]
  })
}

output "server_ip" {
  value = hcloud_server.web.ipv4_address
}
