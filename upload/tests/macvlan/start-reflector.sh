#!/bin/bash

set -e

IFS=',' read -ra PRIVATEIPSA <<< "$PRIVATEIPS"

IP1=${PRIVATEIPSA[0]}
IP2=${PRIVATEIPSA[1]}
IP3=${PRIVATEIPSA[2]}
IP4=${PRIVATEIPSA[3]}

docker run --net=none -d --name=netserver netperf netserver -D -p $NETSERVERPORT

pid=$(docker inspect -f '{{ .State.Pid }}' netserver)


# before we set up the veth pair, make sure it does not exist
if ip link show | grep -qw A1 ; then
	ip link del A1
fi

ip link add A1 link team0 netns $pid type macvlan mode bridge
nsenter --target $pid --net ip link set dev A1 name eth0
nsenter --target $pid --net ip link set eth0 up
nsenter --target $pid --net ip addr add $IP3/29 dev eth0

# if devtype is target, we get the management IP
if [[ "$DEVTYPE" == "target" ]]; then
	# get our management IP and gateway
	nsenter --target $pid --net ip addr add $PRIVATEMGMTIPCIDR dev eth0
	# default route is just to the default on the switch
	nsenter --target $pid --net ip route add default via $PRIVATEGATEWAY dev eth0
	# must ping the gateway so it register our mac address
	nsenter --target $pid --net ping -c 3 -W 2 $PRIVATEGATEWAY >/dev/null 2>&1 || true
fi
