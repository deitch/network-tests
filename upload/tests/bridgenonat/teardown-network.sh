#!/bin/bash

set -e

# set up network with private IPs for host 
# for bridge without NAT, we need to set up an individual bridge

IP1=$1
IP2=$2
IP3=$3
IP4=$4

# tear down the bridge
# make sure it does not already exist
if ip link show | grep -wq br0 ; then
	ip addr del $IP2/29 dev br0
	ip link set br0 down
	ip link del br0
fi
