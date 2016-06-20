#!/bin/bash

set -e

# set up network with private IPs for host 
# for bridge without NAT, we need to set up an individual bridge


IFS=',' read -ra PRIVATEIPSA <<< "$PRIVATEIPS"

IP1=${PRIVATEIPSA[0]}
IP2=${PRIVATEIPSA[1]}
IP3=${PRIVATEIPSA[2]}
IP4=${PRIVATEIPSA[3]}

# tear down the bridge
# make sure it does not already exist
if ip link show | grep -wq br0 ; then
	ip addr del $IP2/29 dev br0
	ip link set br0 down
	ip link del br0
fi
