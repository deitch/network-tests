#!/bin/bash

set -e

IFS=',' read -ra PRIVATEIPSA <<< "$PRIVATEIPS"

IP1=${PRIVATEIPSA[0]}
IP2=${PRIVATEIPSA[1]}
IP3=${PRIVATEIPSA[2]}
IP4=${PRIVATEIPSA[3]}


cid=$(docker run -t -d --net=none --name=netperf netperf sh)

pid=$(docker inspect -f '{{ .State.Pid }}' netperf)
dev=$(echo $TEAMPORTS | awk '{print $1}')


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
if [[ "$DEVTYPE" == "source" ]]; then
	# get our management IP and gateway
	nsenter --target $pid --net ip addr add $PRIVATEMGMTIPCIDR dev eth0
	# default route is just to the default on the switch
	nsenter --target $pid --net ip route add default via $PRIVATEGATEWAY dev eth0
	# must ping the gateway so it register our mac address
	nsenter --target $pid --net ping -c 3 -W 2 $PRIVATEGATEWAY >/dev/null 2>&1 || true
fi


docker exec -i netperf $1
docker kill netperf >/dev/null 2>&1
docker rm netperf >/dev/null 2>&1


