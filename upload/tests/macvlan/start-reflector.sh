#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IP1=${PRIVATEIPS[0]}
IP2=${PRIVATEIPS[1]}
IP3=${PRIVATEIPS[2]}
IP4=${PRIVATEIPS[3]}

hostname=$(hostname)
devtype=${hostname%%[0-9]*}

mgmt=$(awk '{print $1}' /tmp/private_management_ip )
gateway=$(awk '{print $2}' /tmp/private_management_ip )


mkdir -p /var/run/netns


PORTLINE="-p $NETSERVERPORT:$NETSERVERPORT -p $NETSERVERDATAPORT:$NETSERVERDATAPORT -p $NETSERVERDATAPORT:$NETSERVERDATAPORT/udp"
docker run $PORTLINE --net=none -d --name=netserver netperf netserver -D -p $NETSERVERPORT

pid=$(docker inspect -f '{{ .State.Pid }}' netserver)

# before we try to make the link, make sure it does not exist
if [[ -e /var/run/netns/$pid ]]; then
	rm -f /var/run/netns/$pid
fi
ln -s /proc/$pid/ns/net /var/run/netns/$pid

# before we set up the veth pair, make sure it does not exist
if ip link show | grep -qw A1 ; then
	ip link del A1
fi

ip link add A1 link team0 netns $pid type macvlan mode bridge
ip netns exec $pid ip link set dev A1 name eth0
ip netns exec $pid ip link set eth0 up
ip netns exec $pid ip addr add $IP3/29 dev eth0

# if devtype is target, we get the management IP
if [[ "$devtype" == "target" ]]; then
	# get our management IP and gateway
	ip netns exec $pid ip addr add $mgmt dev eth0
	# default route is just to the default on the switch
	ip netns exec $pid ip route add default via $gateway dev eth0
	# must ping the gateway so it register our mac address
	ip netns exec $pid ping -c 3 -W 2 $gateway >/dev/null 2>&1 || true
fi
