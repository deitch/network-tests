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
dev=$(awk '{print $1}' /tmp/iov_nic )
mgmt=$(awk '{print $1}' /tmp/private_management_ip )
gateway=$(awk '{print $2}' /tmp/private_management_ip )
hostname=$(hostname)
devtype=${hostname%%[0-9]*}


# now we should have 4 vif, but we only need two of them
# find the names of the first two
# add a private addresss to each
vnics=$(for i in /sys/class/net/$dev/device/virtfn*; do ls $i/net; done)
vnic1=$(echo $vnics| awk '{print $1}')
vnic2=$(echo $vnics| awk '{print $2}')


ip link set $vnic2 netns $pid


nsenter --target $pid --net ip link set dev $vnic2 name eth0
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


docker exec -i netperf netperf -P 0 -H $TARGET -c -t ${PROTOCOL}_RR -l -${REPS} -v 2 -p $CONTROLPORT -- -k -r ${SIZE},${SIZE} -P ${LOCALPORT},${REMOTEPORT}
docker kill netperf >/dev/null 2>&1
docker rm netperf >/dev/null 2>&1


