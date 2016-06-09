#!/bin/bash

set -e

# set up network with private IPs for host 
# for net=host, simply put both addresses on lo
# because net=host, it will work just fine

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IP1=${PRIVATEIPS[0]}
IP2=${PRIVATEIPS[1]}
IP3=${PRIVATEIPS[2]}
IP4=${PRIVATEIPS[3]}

# need to check each address
if ! ip addr show lo | grep -wq $IP1 ; then
	ip address add $IP1/32 dev lo
fi

if ! ip addr show lo | grep -wq $IP2 ; then
	ip address add $IP2/32 dev lo
fi
