#!/bin/bash

set -e

# set up network with private IPs for host 
# for bridge without NAT, we need to set up an individual bridge

IFS=',' read -ra PRIVATEIPSA <<< "$PRIVATEIPS"

IP1=${PRIVATEIPSA[0]}
IP2=${PRIVATEIPSA[1]}
IP3=${PRIVATEIPSA[2]}
IP4=${PRIVATEIPSA[3]}

# need to check each address, make sure it is not in use
if ip addr show lo | grep -wq $IP1 ; then
	ip address del $IP1/32 dev lo
fi

if ip addr show lo | grep -wq $IP2 ; then
	ip address del $IP2/32 dev lo
fi

if ip addr show lo | grep -wq $IP3 ; then
	ip address del $IP3/32 dev lo
fi

if ip addr show lo | grep -wq $IP4 ; then
	ip address del $IP4/32 dev lo
fi

# need to remove the team0 interface entirely, then replace it
# get the routes
routes=$(echo $TEAMROUTES | tr ',' '\n')
# get our management IP


for i in $TEAMPORTS; do
	echo 4 > /sys/class/net/$i/device/sriov_numvfs || true
done

systemctl stop NetworkManager
# to be safe
pkill teamd

# remove team0 and add the IP and routes
ip link set team0 down
ip li del team0
for dev in $TEAMPORTS; do
	ip li set $dev nomaster
	ip link set $dev up
done

# add the IPs to the first one
dev=$(echo $TEAMPORTS | awk '{print $1}')
ip addr add $PRIVATEMGMTIPCIDR dev $dev
ip addr add $PUBLICIPCIDR dev $dev

# add the routes
echo "$routes" | while read -r r; do
	ip route replace ${r%%dev*} dev $dev
done

# remove route and IP, so we can use it in container
ip route del 10.0.0.0/8 via $PRIVATEGATEWAY dev $dev
ip addr del $PRIVATEMGMTIPCIDR dev $dev





