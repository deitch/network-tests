#!/bin/bash

# only remove the network once, on the source, if it exists

if docker network ls | grep -wq overlay; then
	docker network rm overlay
fi

# remove firewall ports
IPRANGE=192.168.0.0/16

# open the firewall ports necessary
firewall-cmd --zone=trusted --remove-source=$IPRANGE || true
