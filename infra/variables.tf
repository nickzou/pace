variable "ssh_key_name" {
  type = string
}

variable "location" {
  type    = string
  default = "hel1"
}

variable "server_type" {
  type    = string
  default = "cax11"
}

variable "image" {
  type    = string
  default = "ubuntu-24.04"
}
