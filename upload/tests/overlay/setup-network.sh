#!/bin/bash

set -e

# remove any old network if it exists
if docker network ls | grep -wq overlay; then
	docker network rm overlay
fi

IPRANGE=192.168.0.0/16
hostname=$(hostname)
devtype=${hostname%%[0-9]*}

# open the firewall ports necessary
firewall-cmd --zone=trusted --add-source=$IPRANGE || true

# only create the network once, on the source
if [[ "$devtype" == "source" ]]; then
	docker network create --driver=overlay --subnet=$IPRANGE overlay
fi


