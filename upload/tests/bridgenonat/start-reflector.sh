#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IP1=${PRIVATEIPS[0]}
IP2=${PRIVATEIPS[1]}
IP3=${PRIVATEIPS[2]}
IP4=${PRIVATEIPS[3]}


PORTLINE="-p $NETSERVERPORT:$NETSERVERPORT -p $NETSERVERDATAPORT:$NETSERVERDATAPORT -p $NETSERVERDATAPORT:$NETSERVERDATAPORT/udp"
docker run $PORTLINE --net=none -d --name=netserver netperf netserver -D -p $NETSERVERPORT

pid=$(docker inspect -f '{{ .State.Pid }}' netserver)


# before we set up the veth pair, make sure it does not exist
if ip link show | grep -qw A0 ; then
	ip link del A0
fi
ip link add A1 type veth peer name A0
ip link set A0 master br0
ip link set A0 up
ip link set A1 netns $pid
nsenter --target $pid --net ip link set dev A1 name eth0
nsenter --target $pid --net ip link set eth0 up
nsenter --target $pid --net ip addr add $IP3/29 dev eth0
# default route is just to the default on the switch
nsenter --target $pid --net ip route add default via $IP2 dev eth0

