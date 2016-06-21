#!/bin/bash

set -e

IFS=',' read -ra PRIVATEIPSA <<< "$PRIVATEIPS"

IP1=${PRIVATEIPSA[0]}
IP2=${PRIVATEIPSA[1]}
IP3=${PRIVATEIPSA[2]}
IP4=${PRIVATEIPSA[3]}


cid=$(docker run -t -d --net=none --name=netperf netperf sh)

pid=$(docker inspect -f '{{ .State.Pid }}' netperf)


# before we set up the veth pair, make sure it does not exist
if ip link show | grep -qw B0 ; then
	ip link del B0
fi
ip link add B1 type veth peer name B0
ip link set B0 master br0
ip link set B0 up
ip link set B1 netns $pid

nsenter --target $pid --net ip link set dev B1 name eth0
nsenter --target $pid --net ip link set eth0 up
nsenter --target $pid --net ip addr add $IP4/29 dev eth0
# default route is just to the default on the switch
nsenter --target $pid --net ip route add default via $IP2 dev eth0



docker exec -i netperf $@
docker kill netperf >/dev/null 2>&1
docker rm netperf >/dev/null 2>&1


