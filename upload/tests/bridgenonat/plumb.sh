#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IP1=${PRIVATEIPS[0]}
IP2=${PRIVATEIPS[1]}
IP3=${PRIVATEIPS[2]}
IP4=${PRIVATEIPS[3]}

mkdir -p /var/run/netns

### netserver container
#

# do we even have a netserver container?
isRunning=$(docker ps -f name=netserver -q)
if [[ -n "$isRunning" ]]; then
	pid=$(docker inspect -f '{{ .State.Pid }}' netserver)

	# before we try to make the link, make sure it does not exist
	if [[ -e /var/run/netns/$pid ]]; then
		rm -f /var/run/netns/$pid
	fi
	ln -s /proc/$pid/ns/net /var/run/netns/$pid

	# before we set up the veth pair, make sure it does not exist
	if ip link show | grep -qw A0 ; then
		ip link del A0
	fi
	ip link add A1 type veth peer name A0
	ip link set A0 master br0
	ip link set A0 up
	ip link set A1 netns $pid
	ip netns exec $pid ip link set dev A1 name eth0
	ip netns exec $pid ip link set eth0 up
	ip netns exec $pid ip addr add $IP3/29 dev eth0
	# default route is just to the default on the switch
	ip netns exec $pid ip route add default via $IP2 dev eth0
fi

### netperf container
#
# do we even have a netserver container?
isRunning=$(docker ps -f name=netperf -q)
if [[ -n "$isRunning" ]]; then
	pid=$(docker inspect -f '{{ .State.Pid }}' netperf)

	# before we try to make the link, make sure it does not exist
	if [[ -e /var/run/netns/$pid ]]; then
		rm -f /var/run/netns/$pid
	fi


	# before we set up the veth pair, make sure it does not exist
	if ip link show | grep -qw B0 ; then
		ip link del B0
	fi
	ln -s /proc/$pid/ns/net /var/run/netns/$pid
	ip link add B1 type veth peer name B0
	ip link set B0 master br0
	ip link set B0 up
	ip link set B1 netns $pid
	ip netns exec $pid ip link set dev B1 name eth0
	ip netns exec $pid ip link set eth0 up
	ip netns exec $pid ip addr add $IP4/29 dev eth0
	# default route is just to the default on the switch
	ip netns exec $pid ip route add default via $IP2 dev eth0
fi
