#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IP1=${PRIVATEIPS[0]}
IP2=${PRIVATEIPS[1]}
IP3=${PRIVATEIPS[2]}
IP4=${PRIVATEIPS[3]}


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



docker exec -i netperf netperf -P 0 -H $TARGET -c -t ${PROTOCOL}_RR -l -${REPS} -v 2 -p $CONTROLPORT -- -k -r ${SIZE},${SIZE} -P ${LOCALPORT},${REMOTEPORT}
docker kill netperf >/dev/null 2>&1
docker rm netperf >/dev/null 2>&1


