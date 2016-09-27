#!/bin/bash

set -e

# stop flannel
pkill flanneld || true

# remove firewall ports
IPRANGE=192.168.0.0/16

# we can fail at this, because it might have been removed already on the other side
etcdctl rm /coreos.com/network/config || true

# open the firewall ports necessary
firewall-cmd --zone=trusted --remove-source=$IPRANGE || true

# restart the docker engine with the right bip
systemctl stop docker

rm -f /etc/systemd/system/docker.service.d/99-flannel.conf

systemctl daemon-reload
systemctl start docker

# remove any old routes
ip ro | awk '/flannel/ {print $1,$2,$3}' | while read line; do 
	ip ro del $line
done
