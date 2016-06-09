#!/bin/bash


COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IP1=${PRIVATEIPS[0]}
IP2=${PRIVATEIPS[1]}
IP3=${PRIVATEIPS[2]}
IP4=${PRIVATEIPS[3]}

nic=team0

# get our management IP
mgmt=$(ip addr show $nic | awk '/10\.[0-9]+\.[0-9]+\.[0-9]+\/[0-9]+/ {print $2}')
# get our gateway
gateway=$(ip route | awk '/10.0.0.0\/8/ {print $3}')

# we need to save these to put them back
if [[ -n "$mgmt" && -n "$gateway" ]]; then
	echo "$mgmt $gateway" > /tmp/private_management_ip
fi

# remove route
ip route del 10.0.0.0/8 via $gateway dev $nic
# remove IP
ip addr del $mgmt dev $nic


