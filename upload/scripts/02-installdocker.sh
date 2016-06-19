#!/bin/bash

set -e



if command -v "docker" > /dev/null 2>&1; then
	yum update docker
else 
	curl -fsSL https://get.docker.com/ | sh
fi


# we need our mgmt IP for the cluster
mgmt=$(ip addr show $nic | awk '/10\.[0-9]+\.[0-9]+\.[0-9]+\/[0-9]+/ {print $2}')
mgmt=${mgmt%%/*}

# if it is already running, stop it
systemctl stop docker

# clear out any old configs that may get in the way
rm -rf /var/lib/docker

# ensure that it runs with a shared KV store
# restart docker daemon with 
# --cluster-store=etcd://<ETCD IP>:2379
mkdir -p /etc/systemd/system/docker.service.d/
CONF_FILE=/etc/systemd/system/docker.service.d/override.conf
cat > $CONF_FILE <<EOF
[Unit]
After=network.target docker.socket etcd.service
Requires=etcd.service docker.socket

[Service]
ExecStart=
ExecStart=/usr/bin/docker daemon --cluster-store etcd://127.0.0.1:2379 --cluster-advertise $mgmt:0 -H fd://
EOF

cp $CONF_FILE $CONF_FILE.clean

systemctl daemon-reload
systemctl start docker

