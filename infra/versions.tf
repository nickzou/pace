terraform {
  required_version = ">= 1.6"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.48"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.0"
    }
  }
}
