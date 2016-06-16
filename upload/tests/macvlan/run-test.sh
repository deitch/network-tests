#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IP1=${PRIVATEIPS[0]}
IP2=${PRIVATEIPS[1]}
IP3=${PRIVATEIPS[2]}
IP4=${PRIVATEIPS[3]}

mgmt=$(awk '{print $1}' /tmp/private_management_ip )
gateway=$(awk '{print $2}' /tmp/private_management_ip )
hostname=$(hostname)
devtype=${hostname%%[0-9]*}



docker run -t -d --net=none --name=netperf netperf sh

pid=$(docker inspect -f '{{ .State.Pid }}' netperf)

# before we set up the veth pair, make sure it does not exist
if ip link show | grep -qw B1 ; then
	ip link del B1
fi


ip link add B1 link team0 netns $pid type macvlan mode bridge
nsenter --target $pid --net ip link set dev B1 name eth0
nsenter --target $pid --net ip link set eth0 up
nsenter --target $pid --net ip addr add $IP4/29 dev eth0

# if devtype is source, we get the management IP
if [[ "$devtype" == "source" ]]; then
	# get our management IP and gateway
	nsenter --target $pid --net ip addr add $mgmt dev eth0
	# default route is just to the default on the switch
	nsenter --target $pid --net ip route add default via $gateway dev eth0
	# must ping the gateway so it register our mac address
	nsenter --target $pid --net ping -c 3 -W 2 $gateway >/dev/null 2>&1 || true
fi

docker exec -i netperf netperf  -P 0 -H $TARGET -c -t ${PROTOCOL}_RR -l -${REPS} -v 2 -p $CONTROLPORT -- -k -r ${SIZE},${SIZE} -P ${LOCALPORT},${REMOTEPORT}
docker kill netperf >/dev/null 2>&1
docker rm netperf >/dev/null 2>&1

