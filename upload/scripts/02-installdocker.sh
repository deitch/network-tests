#!/bin/bash

set -e



if command -v "docker" > /dev/null 2>&1; then
	yum update docker
else 
	curl -fsSL https://get.docker.com/ | sh
fi

# if it is already running, stop it
systemctl stop docker

# ensure that it runs with a shared KV store
# restart docker daemon with 
# --cluster-store=etcd://<ETCD IP>:2379
mkdir -p /etc/systemd/system/docker.service.d/
cat > /etc/systemd/system/docker.service.d/override.conf <<EOF
[Service]
ExecStart=
ExecStart=/usr/bin/docker daemon --cluster-store etcd://127.0.0.1:2379 -H fd://
EOF

systemctl daemon-reload
systemctl start docker

