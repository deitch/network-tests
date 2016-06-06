#!/bin/bash

set -e

# set up network with private IPs for host 
# for bare metal, simply remove both addresses from lo

IP1=$1
IP2=$2

# need to check each address
if ip addr show lo | grep -wq $IP1 ; then
	ip address del $IP1/32 dev lo
fi

if ip addr show lo | grep -wq $IP2 ; then
	ip address del $IP2/32 dev lo
fi
