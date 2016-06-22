#!/bin/bash

set -e

# only remove the network once, on the source, if it exists

IPRANGE=192.168.0.0/16

if docker network ls | grep -wq calico; then
	calicoctl pool remove $IPRANGE || true
	docker network rm calico || true
fi
calicoctl node stop
calicoctl node remove


# remove firewall ports

firewall-cmd --zone=trusted --remove-source=$IPRANGE || true

