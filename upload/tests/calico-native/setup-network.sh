#!/bin/bash

set -e

# set up network with private IPs for host 
# for net=bridge, simply put both addresses on lo
# because of port mapping, it will work just fine


# launch calico on every host
NO_DEFAULT_POOLS=true calicoctl node --libnetwork
calicoctl pool add $PRIVATEIPCIDR

# only create the network once, on the source
if ! docker network ls | grep -wq calico; then
	docker network create --driver calico --ipam-driver calico calico || true
fi

# at this juncture, we should have a calico network, or fail
if ! docker network ls | grep -wq calico; then
	echo "docker network calico does not exist"
	exit 1
fi


