provider "hcloud" {}

data "hcloud_ssh_key" "main" {
  name = var.ssh_key_name
}

resource "hcloud_firewall" "web" {
  name = "pace-web"
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
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
