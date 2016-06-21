#!/bin/bash

set -e

# only remove the network once, on the source, if it exists

if docker network ls | grep -wq calico; then
	docker network rm calico || true
fi
calicoctl node stop
calicoctl node remove


# remove firewall ports
IPRANGE=192.168.0.0/16

# open the firewall ports necessary
firewall-cmd --zone=trusted --remove-source=$IPRANGE || true

