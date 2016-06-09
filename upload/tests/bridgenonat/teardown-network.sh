#!/bin/bash

set -e

# set up network with private IPs for host 
# for bridge without NAT, we need to set up an individual bridge

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IP1=${PRIVATEIPS[0]}
IP2=${PRIVATEIPS[1]}
IP3=${PRIVATEIPS[2]}
IP4=${PRIVATEIPS[3]}

# tear down the bridge
# make sure it does not already exist
if ip link show | grep -wq br0 ; then
	ip addr del $IP2/29 dev br0
	ip link set br0 down
	ip link del br0
fi
