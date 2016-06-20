#!/bin/bash

set -e

# set up network with private IPs for host 
# for bridge without NAT, we need to set up an individual bridge

IFS=',' read -ra PRIVATEIPSA <<< "$PRIVATEIPS"

IP1=${PRIVATEIPSA[0]}
IP2=${PRIVATEIPSA[1]}
IP3=${PRIVATEIPSA[2]}
IP4=${PRIVATEIPSA[3]}

# need to check each address, make sure it is not in use
if ip addr show lo | grep -wq $IP1 ; then
	ip address del $IP1/32 dev lo
fi

if ip addr show lo | grep -wq $IP2 ; then
	ip address del $IP2/32 dev lo
fi

if ip addr show lo | grep -wq $IP3 ; then
	ip address del $IP3/32 dev lo
fi

if ip addr show lo | grep -wq $IP4 ; then
	ip address del $IP4/32 dev lo
fi

# next we need to set up a bridge
# make sure it does not already exist
if ip link show | grep -wq br0 ; then
	ip link set br0 down
	ip link del br0
fi
ip link add br0 type bridge
ip link set br0 up
ip addr add $IP2/29 dev br0

