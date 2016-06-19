#!/bin/bash

set -e

# set up network with private IPs for host 
# for bridge without NAT, we need to set up an individual bridge

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IP1=${PRIVATEIPS[0]}
IP2=${PRIVATEIPS[1]}
IP3=${PRIVATEIPS[2]}
IP4=${PRIVATEIPS[3]}

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

# enable sr-iov
#devs=$(lspci | grep -i Ethernet | grep -vi virtual | awk '{print $1}')
# find the interface name that represents the first interface
# remove from team0
# set it up
#for i in $devs; do
#	echo 4 > /sys/bus/pci/devices/0000:$i/sriov_numvfs || true
#done

# need to remove the team0 interface entirely, then replace it
# get the underlying ports for the team0
nic=team0
ports=$(ip link | awk -F: "/master $nic/"' {print $2}')
# get the ips
ips=$(ip addr show $nic | awk '/inet / {print $2}')
# get the routes
routes=$(ip ro | grep $nic | grep -w via)
# get our management IP
mgmt=$(echo "$ips" | grep '^10.')
public=$(echo "$ips" | grep -v '^10.')
# get our gateway
gateway=$(echo "$routes" | awk '/10.0.0.0\/8/ {print $3}')
publicgateway=$(echo "$routes" | awk '/default/ {print $3}')

# we need to save these to put them back
if [[ -n "$mgmt" && -n "$gateway" ]]; then
	echo "$mgmt $gateway" > /tmp/private_management_ip
fi
# we need to save these to put them back
if [[ -n "$public" && -n "$publicgateway" ]]; then
	echo "$public $publicgateway" > /tmp/public_management_ip
fi

# save the ports for later use
if [[ -n "$devs" ]]; then
	echo "$ports" > /tmp/team_ports
fi



for i in $ports; do
	echo 4 > /sys/class/net/$i/device/sriov_numvfs || true
done

systemctl stop NetworkManager
# to be safe
pkill teamd

# remove team0 and add the IP and routes
ip link set team0 down
ip li del team0
for dev in $ports; do
	ip li set $dev nomaster
	ip link set $dev up
done

# add the IPs to the first one
dev=$(echo $ports | awk '{print $1}')
for ip in $ips; do
	ip addr add $ip dev $dev
done

# add the routes
echo "$routes" | while read -r r; do
	ip route replace ${r%%dev*} dev $dev
done

# save the key device
echo $dev > /tmp/iov_nic


# remove route and IP, so we can use it in container
ip route del 10.0.0.0/8 via $gateway dev $dev
ip addr del $mgmt dev $dev





