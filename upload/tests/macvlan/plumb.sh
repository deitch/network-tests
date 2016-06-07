#!/bin/bash

set -e

IP1=$1
IP2=$2
IP3=$3
IP4=$4


#####
# 
# Logic for IP address and routes
# - all containers get a private IP
# - in addition, one container on each host gets the management IP
#     netperf on source
#     netserver on target
# 
####

hostname=$(hostname)
devtype=${hostname%%[0-9]*}

mgmt=$(awk '{print $1}' /tmp/private_management_ip )
gateway=$(awk '{print $2}' /tmp/private_management_ip )


mkdir -p /var/run/netns

### netserver container
#

# do we even have a netserver container?
isRunning=$(docker ps -f name=netserver -q)
if [[ -n "$isRunning" ]]; then
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
fi




### netperf container
#
# do we even have a netserver container?
isRunning=$(docker ps -f name=netperf -q)
if [[ -n "$isRunning" ]]; then
	pid=$(docker inspect -f '{{ .State.Pid }}' netperf)

	# before we try to make the link, make sure it does not exist
	if [[ -e /var/run/netns/$pid ]]; then
		rm -f /var/run/netns/$pid
	fi


	# before we set up the veth pair, make sure it does not exist
	if ip link show | grep -qw B1 ; then
		ip link del B1
	fi
	ln -s /proc/$pid/ns/net /var/run/netns/$pid


	ip link add B1 link team0 netns $pid type macvlan mode bridge
	ip netns exec $pid ip link set dev B1 name eth0
	ip netns exec $pid ip link set eth0 up
	ip netns exec $pid ip addr add $IP4/29 dev eth0

	# if devtype is source, we get the management IP
	if [[ "$devtype" == "source" ]]; then
		# get our management IP and gateway
		ip netns exec $pid ip addr add $mgmt dev eth0
		# default route is just to the default on the switch
		ip netns exec $pid ip route add default via $gateway dev eth0
		# must ping the gateway so it register our mac address
		ip netns exec $pid ping -c 3 -W 2 $gateway >/dev/null 2>&1 || true
	fi
fi
