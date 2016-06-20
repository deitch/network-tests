#!/bin/bash

set -e

# set up network with private IPs for host 
# for net=bridge, simply put both addresses on lo
# because of port mapping, it will work just fine


IPRANGE=192.168.0.0/16

# add our range to the trusted zone
if ! firewall-cmd --zone=trusted --list-source | grep -wq $IPRANGE ; then
	firewall-cmd --zone=trusted --add-source=$IPRANGE
fi

# need to account for our remote peers
WEAVE_NO_FASTDP=true weave launch --ipalloc-range $IPRANGE $PEER


